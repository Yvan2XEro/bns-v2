import * as azure from "@pulumi/azure-native";
import type * as pulumi from "@pulumi/pulumi";

export interface AksResult {
	kubeconfig: pulumi.Output<string>;
	clusterName: pulumi.Output<string>;
	/** The public IP every pod's outbound traffic leaves from (one, by design). */
	egressIps: pulumi.Output<string>[];
}

export function createAksCluster(
	name: string,
	location: string,
	nodeCount: number,
	vmSize: string,
): AksResult {
	const rg = new azure.resources.ResourceGroup(`${name}-rg`, {
		location,
		tags: { Project: "bns", ManagedBy: "pulumi" },
	});

	const cluster = new azure.containerservice.ManagedCluster(name, {
		resourceGroupName: rg.name,
		location,
		agentPoolProfiles: [
			{
				name: "system",
				count: nodeCount,
				vmSize,
				mode: "System",
				osDiskSizeGB: 50,
				type: "VirtualMachineScaleSets",
				enableAutoScaling: true,
				minCount: 1,
				maxCount: nodeCount * 2,
			},
		],
		identity: { type: "SystemAssigned" },
		dnsPrefix: name,
		enableRBAC: true,
		networkProfile: {
			networkPlugin: "azure",
			loadBalancerSku: "standard",
			// Exactly one managed outbound IP, kept for the cluster's life: the
			// address external services (Atlas) allow in.
			loadBalancerProfile: { managedOutboundIPs: { count: 1 } },
		},
		tags: { Project: "bns", ManagedBy: "pulumi" },
	});

	const creds = azure.containerservice.listManagedClusterUserCredentialsOutput({
		resourceGroupName: rg.name,
		resourceName: cluster.name,
	});

	const kubeconfig = creds.kubeconfigs[0].value.apply((v) =>
		Buffer.from(v, "base64").toString(),
	);

	const egressIp = cluster.networkProfile.apply((profile) => {
		const id = profile?.loadBalancerProfile?.effectiveOutboundIPs?.[0]?.id;
		if (!id) throw new Error("AKS reported no outbound IP");
		// /subscriptions/…/resourceGroups/<rg>/providers/Microsoft.Network/publicIPAddresses/<name>
		const match =
			/resourceGroups\/([^/]+)\/providers\/Microsoft\.Network\/publicIPAddresses\/([^/]+)$/i.exec(
				id,
			);
		if (!match) throw new Error(`Unexpected outbound IP id: ${id}`);
		return { resourceGroupName: match[1], publicIpAddressName: match[2] };
	});
	const address = azure.network
		.getPublicIPAddressOutput({
			resourceGroupName: egressIp.apply((ip) => ip.resourceGroupName),
			publicIpAddressName: egressIp.apply((ip) => ip.publicIpAddressName),
		})
		.apply((ip) => {
			if (!ip.ipAddress)
				throw new Error("The AKS outbound IP has no address yet");
			return ip.ipAddress;
		});

	return { kubeconfig, clusterName: cluster.name, egressIps: [address] };
}
