import * as proxmox from "@muhlba91/pulumi-proxmoxve";
import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";

/**
 * K3s on Proxmox VMs, behind the same contract as `createEksCluster` and
 * `createAksCluster`: a kubeconfig and a cluster name for `deployKubernetes`.
 *
 * Proxmox has no managed Kubernetes, so this clones one server and
 * `nodeCount` workers from a cloud-init template, installs K3s over SSH and
 * reads the kubeconfig back. Every remote step is idempotent and re-runs
 * when its VM is replaced, so a second `pulumi up` changes nothing.
 *
 * The template must be a cloud image with cloud-init and qemu-guest-agent
 * (scripts/create-proxmox-template.sh builds it).
 */
export interface ProxmoxResult {
	kubeconfig: pulumi.Output<string>;
	clusterName: pulumi.Output<string>;
}

interface VmSize {
	cores: number;
	memory: number;
	disk: number;
}

/** `instanceType` on Proxmox names one of these profiles (MiB, GiB). */
export const PROXMOX_SIZES: Record<string, VmSize> = {
	small: { cores: 2, memory: 4096, disk: 40 },
	medium: { cores: 4, memory: 8192, disk: 64 },
	large: { cores: 8, memory: 16384, disk: 100 },
};

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function assertIpv4(label: string, value: string): void {
	const match = IPV4.exec(value);
	if (!match || match.slice(1).some((part) => Number(part) > 255))
		throw new Error(`${label} is not an IPv4 address: "${value}"`);
}

/** Single-quotes a value for a POSIX shell, so config never becomes code. */
function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function createProxmoxCluster(
	name: string,
	nodeCount: number,
	instanceType: string,
): ProxmoxResult {
	if (!Number.isInteger(nodeCount) || nodeCount < 1)
		throw new Error("nodeCount must be a positive integer");

	const size = PROXMOX_SIZES[instanceType];
	if (!size)
		throw new Error(
			`Unsupported Proxmox instanceType "${instanceType}". ` +
				`Supported values: ${Object.keys(PROXMOX_SIZES).join(", ")}`,
		);

	const cfg = new pulumi.Config("proxmox");
	const endpoint = cfg.require("endpoint");
	const apiToken = cfg.requireSecret("apiToken");
	// A homelab Proxmox usually serves a self-signed certificate.
	const insecure = cfg.getBoolean("insecure") ?? false;
	const nodeName = cfg.require("nodeName");
	const templateVmId = cfg.requireNumber("templateVmId");
	const firstVmId = cfg.requireNumber("firstVmId");
	const datastoreId = cfg.require("datastoreId");
	const bridge = cfg.require("bridge");
	const vlanId = cfg.getNumber("vlanId");
	const gateway = cfg.require("gateway");
	const subnetPrefix = cfg.getNumber("subnetPrefix") ?? 24;
	const dnsServers = cfg.getObject<string[]>("dnsServers") ?? [gateway];
	const sshUser = cfg.require("sshUser");
	const sshPublicKey = cfg.require("sshPublicKey");
	const sshPrivateKey = cfg.requireSecret("sshPrivateKey");
	const controlPlaneIp = cfg.require("controlPlaneIp");
	const workerIps = cfg.requireObject<string[]>("workerIps");
	// Pinned so that a replaced VM joins with the same version as the others.
	const k3sVersion = cfg.get("k3sVersion") ?? "v1.31.4+k3s1";

	assertIpv4("proxmox:gateway", gateway);
	assertIpv4("proxmox:controlPlaneIp", controlPlaneIp);
	for (const [index, ip] of workerIps.entries())
		assertIpv4(`proxmox:workerIps[${index}]`, ip);
	for (const [index, ip] of dnsServers.entries())
		assertIpv4(`proxmox:dnsServers[${index}]`, ip);
	if (workerIps.length < nodeCount)
		throw new Error(
			`proxmox:workerIps must list at least ${nodeCount} addresses (nodeCount)`,
		);
	if (new Set([controlPlaneIp, ...workerIps]).size !== workerIps.length + 1)
		throw new Error("proxmox:controlPlaneIp and workerIps must all differ");

	const provider = new proxmox.Provider(`${name}-proxmox`, {
		endpoint,
		apiToken,
		insecure,
	});

	const createVm = (vmName: string, vmId: number, ip: string) =>
		new proxmox.vm.VirtualMachine(
			vmName,
			{
				nodeName,
				vmId,
				name: vmName,
				tags: ["bns", "k3s", pulumi.getStack()],
				onBoot: true,
				started: true,
				// Stopping waits for the guest agent; a hung guest must not
				// block a destroy forever.
				stopOnDestroy: true,
				clone: { vmId: templateVmId, nodeName, full: true, retries: 3 },
				agent: { enabled: true, type: "virtio", timeout: "5m" },
				cpu: { cores: size.cores, sockets: 1, type: "host" },
				memory: { dedicated: size.memory },
				scsiHardware: "virtio-scsi-single",
				disks: [
					{
						// Must be the template's boot disk interface; it can only grow.
						interface: "scsi0",
						datastoreId,
						size: size.disk,
						iothread: true,
						discard: "on",
					},
				],
				networkDevices: [
					{ bridge, model: "virtio", ...(vlanId ? { vlanId } : {}) },
				],
				operatingSystem: { type: "l26" },
				// The provider's default CD-ROM is the host's physical drive; a
				// server without one makes QEMU refuse to start. Left empty.
				cdrom: { fileId: "none" },
				initialization: {
					type: "nocloud",
					datastoreId,
					dns: { servers: dnsServers },
					ipConfigs: [{ ipv4: { address: `${ip}/${subnetPrefix}`, gateway } }],
					userAccount: { username: sshUser, keys: [sshPublicKey] },
				},
			},
			{ provider, ignoreChanges: ["clone"] },
		);

	const server = createVm(`${name}-server`, firstVmId, controlPlaneIp);
	const workers = Array.from({ length: nodeCount }, (_, index) =>
		createVm(
			`${name}-worker-${index + 1}`,
			firstVmId + index + 1,
			workerIps[index] as string,
		),
	);

	// The VM reports "created" before sshd is up: keep dialling for ~5 min.
	const connection = (host: string) => ({
		host,
		user: sshUser,
		privateKey: sshPrivateKey,
		dialErrorLimit: 30,
		perDialTimeout: 10,
	});

	const waitForCloudInit =
		"cloud-init status --wait >/dev/null 2>&1 || test -f /var/lib/cloud/instance/boot-finished";

	const serverName = `${name}-server`;
	const serverInstall = new command.remote.Command(
		`${name}-server-install`,
		{
			connection: connection(controlPlaneIp),
			create: [
				"set -eu",
				waitForCloudInit,
				"if ! command -v k3s >/dev/null 2>&1; then",
				`  curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=${shellQuote(k3sVersion)} sh -s - server \\`,
				`    --node-name ${shellQuote(serverName)} \\`,
				`    --node-ip ${shellQuote(controlPlaneIp)} \\`,
				`    --tls-san ${shellQuote(controlPlaneIp)} \\`,
				// ingress-nginx and cert-manager come from deployKubernetes;
				// K3s' bundled Traefik would fight it for ports 80/443.
				"    --disable traefik \\",
				"    --write-kubeconfig-mode 600",
				"fi",
				"sudo systemctl enable --now k3s",
				"for i in $(seq 1 60); do sudo k3s kubectl get --raw=/readyz >/dev/null 2>&1 && exit 0; sleep 5; done",
				"echo 'k3s API did not become ready' >&2; exit 1",
			].join("\n"),
			// A replaced VM is a new machine: install again.
			triggers: [server.id],
		},
		{ dependsOn: [server], customTimeouts: { create: "20m" } },
	);

	const token = new command.remote.Command(
		`${name}-server-token`,
		{
			connection: connection(controlPlaneIp),
			create: "sudo cat /var/lib/rancher/k3s/server/node-token",
			triggers: [serverInstall.id],
		},
		{ dependsOn: [serverInstall], additionalSecretOutputs: ["stdout"] },
	);

	const workerInstalls = workers.map((worker, index) => {
		const workerName = `${name}-worker-${index + 1}`;
		const ip = workerIps[index] as string;
		const install = new command.remote.Command(
			`${workerName}-install`,
			{
				connection: connection(ip),
				create: pulumi.interpolate`set -eu
${waitForCloudInit}
if ! command -v k3s >/dev/null 2>&1; then
  curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=${shellQuote(k3sVersion)} K3S_URL=${shellQuote(`https://${controlPlaneIp}:6443`)} K3S_TOKEN=${token.stdout.apply((value) => shellQuote(value.trim()))} sh -s - agent --node-name ${shellQuote(workerName)} --node-ip ${shellQuote(ip)}
fi
sudo systemctl enable --now k3s-agent
sudo systemctl is-active --quiet k3s-agent`,
				triggers: [worker.id, serverInstall.id],
			},
			{
				dependsOn: [worker, token],
				customTimeouts: { create: "20m" },
			},
		);

		// Scaling down: the node object goes with its VM instead of staying
		// NotReady in `kubectl get nodes` forever.
		new command.remote.Command(
			`${workerName}-registration`,
			{
				connection: connection(controlPlaneIp),
				create: "true",
				delete: `sudo k3s kubectl delete node ${shellQuote(workerName)} --ignore-not-found`,
			},
			{ dependsOn: [install] },
		);

		return install;
	});

	// Waits for every worker to report Ready before handing the cluster over.
	const nodesReady = new command.remote.Command(
		`${name}-nodes-ready`,
		{
			connection: connection(controlPlaneIp),
			create:
				"sudo k3s kubectl wait --for=condition=Ready node --all --timeout=600s",
			triggers: workerInstalls.map((install) => install.id),
		},
		{ dependsOn: workerInstalls, customTimeouts: { create: "15m" } },
	);

	const kubeconfigCommand = new command.remote.Command(
		`${name}-kubeconfig`,
		{
			connection: connection(controlPlaneIp),
			create: "sudo cat /etc/rancher/k3s/k3s.yaml",
			triggers: [serverInstall.id],
		},
		{ dependsOn: [nodesReady], additionalSecretOutputs: ["stdout"] },
	);

	// K3s writes the kubeconfig for use on the server itself.
	const kubeconfig = pulumi.secret(
		kubeconfigCommand.stdout.apply((value) =>
			value.replace(
				/server:\s*https:\/\/127\.0\.0\.1:6443/,
				`server: https://${controlPlaneIp}:6443`,
			),
		),
	);

	return { kubeconfig, clusterName: pulumi.output(name) };
}
