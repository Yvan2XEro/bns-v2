# Runbook — BuyNSellem on K3s / Proxmox

How to deploy, run and migrate BuyNSellem on a K3s cluster that Pulumi builds on
Proxmox. Run every `pulumi` and `bun run` command from `infra/` unless stated
otherwise.

## Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Prepare Proxmox (once)](#3-prepare-proxmox-once)
4. [Create and configure the stack](#4-create-and-configure-the-stack)
5. [Application variables](#5-application-variables)
6. [Deploy](#6-deploy)
7. [Check](#7-check)
8. [DNS and certificates](#8-dns-and-certificates)
9. [Routine operations](#9-routine-operations)
10. [Autoscaling and load testing](#10-autoscaling-and-load-testing)
11. [Migrating production from Dokploy](#11-migrating-production-from-dokploy)
12. [Troubleshooting](#12-troubleshooting)
13. [Tearing down](#13-tearing-down)

---

## 1. Overview

```
Workstation (Pulumi, bun, kubectl)
   │  Proxmox API :8006           SSH :22
   ▼                               ▼
Proxmox ──clones template 9000──► server VM (K3s server)  192.168.0.160
                                └► worker-N VMs (K3s agent) 192.168.0.161…
                                      │
                                      ├─ ingress-nginx (ports 80/443 on every node)
                                      ├─ cert-manager (Let's Encrypt or a local CA)
                                      └─ namespace bns: api ×2–6, web ×2–4, chat-service,
                                         search-indexer, mongodb (rs0), redis, meilisearch
```

| Piece | Where |
|---|---|
| Pulumi program | `infra/src/` (`index.ts` picks aws, azure or proxmox) |
| VMs and K3s | `infra/src/proxmox-k3s.ts` |
| Application deployment | `infra/src/kubernetes/{apps,nginx}.ts` |
| Variable catalog | `infra/src/app-env.ts`: whether each variable is secret, which services receive it, and whether the stack derives it or only Compose uses it |
| `.env` → stack | `infra/scripts/env-to-stack.ts` (`bun run env:check` / `env:apply`) |
| Proxmox template | `infra/scripts/create-proxmox-template.sh` |
| Load test | `infra/loadtest/traffic.js` (`bun run loadtest`) |

A stack is one environment: its VMs, its config and its secrets.

| Stack | Purpose | Domain | Certificate | VMs (IDs / IPs) |
|---|---|---|---|---|
| `proxmox-staging` | tests on the LAN | `buynsellem.lan` (Pi-hole) | `local-ca` | 250+ / 192.168.0.160+ |
| `proxmox-prod` | production after the migration | `buynsellem.com` | `letsencrypt` | 300+ / 192.168.0.170+ |

> Always pass `--stack <name>`, or run `pulumi stack select <name>` first.
> Otherwise `pulumi config set` writes to whichever stack is selected, which may
> not be the one you meant.

---

## 2. Prerequisites

### On the workstation
```bash
curl -fsSL https://get.pulumi.com | sh        # Pulumi CLI
# also: bun, kubectl, k6 (load test), dig
cd infra && bun install
```

### Network
The workstation must reach the Proxmox API (`192.168.0.101:8006`) **and** the
VMs over SSH (`192.168.0.160+`).

- On the LAN: nothing to do.
- Remotely over Tailscale: advertise the subnet from the Proxmox node.
  ```bash
  # on the node
  echo 'net.ipv4.ip_forward = 1' > /etc/sysctl.d/99-tailscale.conf && sysctl -p /etc/sysctl.d/99-tailscale.conf
  tailscale set --advertise-routes=192.168.0.0/24
  ```
  Then approve the route in the Tailscale admin console: machine *pve* → ⋯ →
  *Edit route settings* → tick `192.168.0.0/24`. On a Linux workstation, also
  run `sudo tailscale set --accept-routes`.

### Dedicated SSH key
Pulumi connects to the VMs to install K3s. Use a key without a passphrase.
```bash
ssh-keygen -t ed25519 -f ~/.ssh/bns-k3s -N "" -C "bns-k3s-pulumi"
```

---

## 3. Prepare Proxmox (once)

### 3.1 Node DNS
If Tailscale manages DNS (`/etc/resolv.conf` → `100.100.100.100`) and
`ping deb.debian.org` fails, point the node back at the Pi-hole, with a public
fallback:
```bash
tailscale set --accept-dns=false
printf 'nameserver 192.168.0.98\nnameserver 1.1.1.1\n' > /etc/resolv.conf
```
Also set DNS in the web UI (*node → System → DNS*).

### 3.2 Cloud-init template (VM 9000)
```bash
scp infra/scripts/create-proxmox-template.sh root@192.168.0.101:/root/
ssh root@192.168.0.101 'VMID=9000 STORAGE=local-lvm BRIDGE=vmbr0 bash /root/create-proxmox-template.sh'
```
The script:
- installs `libguestfs-tools`, running `apt-get update` first;
- downloads Ubuntu 24.04 and installs `qemu-guest-agent` into the image;
- empties the machine-id, so each clone gets its own;
- builds the template: boot disk `scsi0`, cloud-init drive `ide2`, serial console.

Check:
```bash
qm config 9000 | grep -E 'template|scsi0|ide2|agent|boot'
```
Do not grow the template's disk: each clone grows it to its own profile's size.

### 3.3 Role, user and API token
These privileges are for Proxmox 9; on Proxmox 8, replace `VM.GuestAgent.Audit`
with `VM.Monitor`. `Sys.Console` is needed because the template has a serial
console.
```bash
PRIVS="VM.Allocate VM.Clone VM.Audit VM.PowerMgmt VM.Config.CDROM VM.Config.CPU VM.Config.Cloudinit VM.Config.Disk VM.Config.HWType VM.Config.Memory VM.Config.Network VM.Config.Options VM.GuestAgent.Audit Datastore.AllocateSpace Datastore.Audit SDN.Use Sys.Audit Sys.Console"
if pveum role list --output-format json | grep -q '"roleid":"PulumiK3s"'; then
  pveum role modify PulumiK3s -privs "$PRIVS"
else
  pveum role add PulumiK3s -privs "$PRIVS"
fi
pveum user add pulumi@pve 2>/dev/null || true
pveum aclmod / -user pulumi@pve -role PulumiK3s
pveum user token add pulumi@pve bns --privsep 0     # write down "value": shown only once
```
The full token is `pulumi@pve!bns=<value>`. Changing the role also applies to
existing tokens. To add a single privilege:
`pveum role modify PulumiK3s -append 1 -privs <Privilege>`.

---

## 4. Create and configure the stack

```bash
pulumi login --local                          # or Pulumi Cloud
export PULUMI_CONFIG_PASSPHRASE='…'            # keep it: secrets cannot be read without it
pulumi stack init proxmox-staging              # or: pulumi stack select proxmox-staging
S=proxmox-staging
```

The non-secret Proxmox settings are in `infra/Pulumi.proxmox-staging.yaml`:
endpoint, `nodeName`, `templateVmId`, `firstVmId`, `datastoreId`, `bridge`,
`gateway`, `sshUser`, `controlPlaneIp`, `workerIps`, `k3sVersion`. Adjust them
before the first deployment. **The IPs and VM IDs must be free.**
```bash
for ip in 160 161 162; do ping -c1 -W1 192.168.0.$ip >/dev/null && echo "192.168.0.$ip IN USE"; done
qm list | awk '$1>=250 && $1<=252'           # on the node
```

Secrets and settings. A value that starts with `-` needs `--` before it.
```bash
pulumi config set --stack $S --secret proxmox:apiToken -- 'pulumi@pve!bns=<value>'
pulumi config set --stack $S --secret proxmox:sshPrivateKey < ~/.ssh/bns-k3s
pulumi config set --stack $S proxmox:sshPublicKey -- "$(cat ~/.ssh/bns-k3s.pub)"

# Private domain (.lan): local CA, and the VMs resolve through the Pi-hole
pulumi config set --stack $S tlsIssuer local-ca
pulumi config set --stack $S --path 'proxmox:dnsServers[0]' 192.168.0.98

# Size: small (2 vCPU, 4 GB, 40 GB) | medium (4, 8, 64) | large (8, 16, 100)
pulumi config set --stack $S instanceType small
pulumi config set --stack $S nodeCount 1               # workers, plus one server

# Autoscaling (optional; defaults: api 2–6, web 2–4)
pulumi config set --stack $S --path autoscaling.api.max 6
```

Check the stack:
```bash
pulumi config --stack $S
grep sshPrivateKey Pulumi.$S.yaml      # must show "secure: …"
```

> **Sizing rules.** A Proxmox disk can grow but never shrink. Going from
> `medium` to `small` on existing VMs fails with `Cannot shrink`. Pick the
> profile before the first `up`, or recreate the VMs (§ 12). Mind the node's
> memory: three `medium` VMs take 24 GB.

---

## 5. Application variables

The variables come from the `.env` of the matching Dokploy environment. They
are never typed by hand.

### 5.1 Prepare the file (at the repo root)
Git ignores every `.env.*` file except the `.env.example` files.

In Dokploy, open the project's *Environment* tab and copy its whole content
into `.env.proxmox-staging` (`.env.prod` for production).

Add the two Pulumi-only lines:
```bash
GHCR_TOKEN=ghp_…          # GitHub classic token, read:packages
ACME_EMAIL=…              # only with tlsIssuer letsencrypt
```

Then adjust:
- **`WEB_DOMAIN`**: this cluster's domain. Two deployments cannot share a
  domain. The stack derives `www.`, `api.` and `chat.` from it, so either
  delete `WEB_WWW_DOMAIN`, `API_DOMAIN` and `CHAT_DOMAIN`, or set them to
  exactly those values.
- **Storage**: set `STORAGE_PROVIDER=s3` (or `azure`). `S3_ENDPOINT`,
  `S3_BUCKET`, `S3_PRIVATE_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID` and
  `S3_SECRET_ACCESS_KEY` must be reachable **from the VMs**. `local` storage is
  refused because the API runs several pods without a shared disk.
- **Novu**: a test environment needs its own Novu environment
  (`NOVU_SECRET_KEY`, `NOVU_APPLICATION_IDENTIFIER`). Otherwise it overwrites
  Dokploy's workflows. You can also leave both lines out.
- **S3 bucket**: a test environment must not write to the production bucket.

### 5.2 Check, then apply
```bash
# from the repo root
bun run infra:env:check --env .env.proxmox-staging --stack proxmox-staging
bun run infra:env:apply --env .env.proxmox-staging --stack proxmox-staging
# or from infra/: bun run env:check|env:apply --env ../.env.proxmox-staging --stack …
```

`env:check` writes nothing. It refuses the file when it finds:
- a name missing from the catalog (add it to `infra/src/app-env.ts`);
- a missing required value;
- the same name set twice;
- hosts that don't match the domain layout;
- local storage.

It also lists the names it skips on purpose: those the stack derives
(`DATABASE_URI`, `REDIS_URL`, public URLs…) and those only Compose uses.

`env:apply` replaces `appEnv` and `appSecrets` (encrypted) as a whole, and sets
`domain`, `ghcrToken`, `acmeEmail`, `imageRegistry` and `imageTag`. Once the
stack is open, it shows what was added, changed or removed, never printing a
secret value.

---

## 6. Deploy

```bash
pulumi preview --stack $S       # ~45 resources: 2–3 VMs, K3s, the cluster
pulumi up --stack $S
```
It takes 10 to 20 minutes, in this order:
1. clone and start the VMs;
2. cloud-init;
3. K3s, pinned and without Traefik, then wait for every node to be `Ready`;
4. cert-manager and ingress-nginx through Helm, with a 15-minute timeout;
5. MongoDB (replica set `rs0`), Redis and Meilisearch;
6. api, web, chat-service, search-indexer and the Ingress.

If a step fails, fix it and run `pulumi up` again: finished steps are not
redone. If VMs were changed or removed by hand, run `pulumi refresh --yes` to
bring the state back in line.

Get the kubeconfig:
```bash
mkdir -p ~/.kube
ssh -i ~/.ssh/bns-k3s ubuntu@192.168.0.160 'sudo cat /etc/rancher/k3s/k3s.yaml' \
  | sed 's/127.0.0.1/192.168.0.160/' > ~/.kube/bns-staging.yaml
chmod 600 ~/.kube/bns-staging.yaml
export KUBECONFIG=~/.kube/bns-staging.yaml
```
Without a kubeconfig, any `kubectl` command also works through the server:
`ssh ubuntu@192.168.0.160 sudo k3s kubectl …`.

---

## 7. Check

```bash
kubectl get nodes -o wide                    # all Ready
kubectl -n bns get pods                      # all Running 1/1
kubectl -n bns get hpa                       # api and web, TARGETS in %
kubectl get certificate -A                   # bns-tls READY=True
kubectl -n bns logs deploy/api --tail=50     # "Ready in …", no Mongo/S3 errors

# The routes, resolved to a node before DNS is set
curl -sk --resolve api.buynsellem.lan:443:192.168.0.161 https://api.buynsellem.lan/api/public/config | head -c 200; echo
curl -sk --resolve buynsellem.lan:443:192.168.0.161 -o /dev/null -w '%{http_code}\n' https://buynsellem.lan/
```
`curl http://<ip>` without a host name returns `404 nginx`. That is expected:
the Ingress routes by host name.

---

## 8. DNS and certificates

### Private domain (Pi-hole, `tlsIssuer: local-ca`)
In Pi-hole, open *Local DNS → DNS Records* and point the four names at **a
node's IP**. K3s' ServiceLB serves ports 80 and 443 on every node.

| Domain | IP |
|---|---|
| `buynsellem.lan` | `192.168.0.161` |
| `www.buynsellem.lan` | `192.168.0.161` |
| `api.buynsellem.lan` | `192.168.0.161` |
| `chat.buynsellem.lan` | `192.168.0.161` |

Alternative: one A record for `buynsellem.lan`, plus *CNAME Records* pointing
`www`, `api` and `chat` at `buynsellem.lan`. MongoDB, Redis and Meilisearch need
no records: they stay inside the cluster.

Export the local CA (valid for ten years) and trust it on each device:
```bash
kubectl -n cert-manager get secret bns-local-ca -o jsonpath='{.data.ca\.crt}' | base64 -d > bns-local-ca.crt
sudo cp bns-local-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates   # Linux
```
- **macOS:** open it in Keychain Access and set it to *Always Trust*.
- **Android or iOS:** install the profile, then enable full trust.

### Public domain (`tlsIssuer: letsencrypt`)
- At the registrar: A records for `@`, `www`, `api` and `chat` → the public IP.
- On the router: forward ports **80 and 443** to a K3s node.
- Let's Encrypt validates over HTTP. Follow the issuance with
  `kubectl get certificate -A`, then
  `kubectl describe certificate bns-tls -n bns`.

---

## 9. Routine operations

### Change a variable
Edit the `.env`, then:
```bash
bun run infra:env:check --env .env.proxmox-staging --stack $S
bun run infra:env:apply --env .env.proxmox-staging --stack $S
pulumi up --stack $S        # pods restart (a checksum of the variables is in their template)
```

### Ship a new version
CI publishes `dev` and `dev-<sha>` on every push to `dev`. On a `v*` tag it
publishes `<version>` and `latest`.

- **Staging** (`imageTag: dev`): containers use `imagePullPolicy: Always`, so a
  restart picks up the new build.
  ```bash
  kubectl -n bns rollout restart deploy/api deploy/web deploy/chat-service deploy/search-indexer
  kubectl -n bns rollout status deploy/api
  ```
- **Production**: set an immutable tag, then run `pulumi up`.
  ```bash
  pulumi config set --stack proxmox-prod imageTag 1.1.2      # or dev-<sha>
  ```
  To roll back, set the previous tag and run `pulumi up` again.

### Reindex search
```bash
kubectl -n bns exec deploy/search-indexer -- bun run src/reindex.ts
```

### Add a worker
```bash
pulumi config set --stack $S nodeCount 2
pulumi config set --stack $S --path 'proxmox:workerIps[1]' 192.168.0.162
pulumi up --stack $S
```
Lowering `nodeCount` removes that worker's VM and its Kubernetes node. Pods are
rescheduled elsewhere, but **the data** of StatefulSets that ran on it is not
moved (local-path storage, see § 12).

### Grow the VMs
`small` → `medium` → `large` is applied in place by `pulumi up`. Shrinking
means recreating the VMs.

### Back up MongoDB
```bash
PASS=$(pulumi config get --stack $S --path appSecrets.MONGO_PASSWORD)
kubectl -n bns exec mongodb-0 -- mongodump -u bns -p "$PASS" --authenticationDatabase admin --archive --gzip > bns-$(date +%F).archive.gz
```

---

## 10. Autoscaling and load testing

The API (2 to 6 pods) and the web app (2 to 4 pods) add pods when CPU goes
above 70% of what each pod requests. A pod is added within a minute. Extra pods
are removed after five calm minutes. MongoDB, Redis, Meilisearch and
chat-service stay at one instance.

```bash
# terminal 1
kubectl -n bns get hpa -w
# terminal 2
kubectl -n bns top pods
# terminal 3 (from infra/)
bun run loadtest -e DOMAIN=buynsellem.lan               # up to 150 visitors
bun run loadtest -e DOMAIN=buynsellem.lan -e PEAK=400   # harder
```
The scenario's thresholds are under 1% errors and a 95th-percentile response
time under 1.5 s. If new pods stay `Pending`, the nodes are full: add a worker
or grow the VMs.

---

## 11. Migrating production from Dokploy

1. **Stack.** Run `pulumi stack init proxmox-prod`. Copy the `proxmox:*`
   settings, changing `firstVmId` (300), the IPs (`.170+`) and the sizes. Leave
   `tlsIssuer` at its default, `letsencrypt`. Set the token and the SSH keys
   (§ 4).
2. **Variables.** Copy Dokploy production's *Environment* into `.env.prod`. Add
   `GHCR_TOKEN` and `ACME_EMAIL`, and set `imageTag` to a release (§ 9). Run
   `env:check`, then `env:apply`. The hashing peppers and secrets
   (`RISK_HASH_SECRET`, `ORDER_PHONE_PEPPER`, `VERIFICATION_HASH_PEPPER`) must
   be **identical** to production, or the existing hashed data can no longer be
   matched.
3. **Deploy** with `pulumi up --stack proxmox-prod`. The new cluster runs
   empty, alongside Dokploy.
4. **Cut-over window.** Put Dokploy in maintenance and stop its API, so the
   database stops changing.
5. **MongoDB data.**
   ```bash
   # on the Dokploy host (mongodb container)
   docker exec <mongodb> mongodump -u "$MONGO_USER" -p "$MONGO_PASSWORD" --authenticationDatabase admin --archive --gzip > prod.archive.gz
   # into the cluster
   PASS=$(pulumi config get --stack proxmox-prod --path appSecrets.MONGO_PASSWORD)
   kubectl -n bns exec -i mongodb-0 -- mongorestore -u bns -p "$PASS" --authenticationDatabase admin --archive --gzip --drop < prod.archive.gz
   kubectl -n bns rollout restart deploy/api
   ```
6. **Files.** Nothing to copy if production already stores files in S3 or
   RustFS: the new cluster uses the same bucket.
7. **Search.** Reindex (§ 9).
8. **DNS.** Point the public records and the 80/443 forwards at the new
   cluster, then follow the Let's Encrypt certificate.
9. **Check** (§ 7), then run a full journey: sign-in, listing, order, sandbox
   payment, message.
10. **Keep Dokploy stopped but intact** for a few days. Pointing DNS back is
    the rollback.

---

## 12. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Temporary failure resolving` on the node | Tailscale DNS (`100.100.100.100`) | § 3.1 |
| `apt`: `404 Not Found` | stale package index | `apt-get update` |
| `failed to locate the entry point` | `main` missing from `package.json` | fixed (`src/index.ts`) |
| `bad flag syntax: -----BEGIN…` | the value is read as a flag | `pulumi config set … -- "<value>"` or `< file` |
| `Missing required configuration variable` | the value went to another stack | `pulumi config --stack $S`, § 4 |
| `appSecrets.X is missing` | variables not applied | § 5.2 |
| `403 Permission check failed (/, Sys.Console)` | missing privilege | § 3.3 |
| `unable to create VM 200: config file already exists` | VM ID taken | change `proxmox:firstVmId`, or remove *your own* stale VMs |
| `QEMU exited with code 1` | see `qm start <id>` on the node | — |
| … `'host_cdrom' block driver requires a file name` | no physical CD-ROM on the host | fixed (`cdrom: none`) |
| `Cannot shrink … disk` | smaller profile on existing VMs | recreate the VMs (below) |
| SSH: `no route to host` | VM stopped, IP not applied, or no route | `qm status`, `qm cloudinit dump <id> network`, Tailscale route |
| ConfigMap: `cannot unmarshal number` | numeric values in config | fixed (converted to text) |
| Helm `context deadline exceeded` | slow image pulls | timeout raised to 15 min; run `up` again |
| `x509: certificate signed by unknown authority` (nginx webhook) | webhook left by a failed release | `kubectl get validatingwebhookconfiguration -o name \| grep ingress-nginx \| xargs kubectl delete`, then `pulumi up` |
| cert-manager webhook `502` | webhook not started yet | run `pulumi up` again |
| `api` never `Ready` | missing variables (S3…) | `kubectl -n bns logs deploy/api` |
| `404 nginx` on `curl http://<ip>` | no host name | § 7 (`--resolve`) |
| Novu `Workflow limit exceeded` | Novu plan limit or shared Novu environment | dedicated Novu environment (§ 5.1) |
| Pods `Pending` under load | nodes full | add a worker or grow the VMs |

### Recreate a test cluster's VMs
```bash
pulumi up --stack $S \
  --replace "$(pulumi stack --stack $S --show-urns | grep -o 'urn:[^ ]*VirtualMachine::bns-proxmox-staging-server')" \
  --replace "$(pulumi stack --stack $S --show-urns | grep -o 'urn:[^ ]*VirtualMachine::bns-proxmox-staging-worker-1')"
```
The recreated VMs lose their data. MongoDB, Redis and Meilisearch use K3s'
local-path storage, which is tied to one node.

### Useful diagnostics
```bash
qm start <id>; qm status <id>; qm config <id>; qm cloudinit dump <id> network   # Proxmox node
qm terminal <id>                                    # serial console, exit with Ctrl+O
kubectl get pods -A -o wide | grep -v Completed
kubectl -n bns describe pod -l app=api | grep -A12 Events
ssh ubuntu@192.168.0.161 'sudo systemctl status k3s-agent --no-pager | tail -15'
```

---

## 13. Tearing down

```bash
pulumi destroy --stack $S        # removes the cluster and its VMs, data included
pulumi stack rm $S               # removes the stack and its config
```
The template (VM 9000), the role and the Proxmox token stay in place.
