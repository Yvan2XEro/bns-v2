# Runbook — BuyNSellem sur K3s / Proxmox

Déployer, exploiter et migrer BuyNSellem sur un cluster K3s créé par Pulumi sur
un Proxmox. Toutes les commandes `pulumi` et `bun run` se lancent depuis
`infra/`, sauf mention contraire.

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Prérequis](#2-prérequis)
3. [Préparer Proxmox (une fois)](#3-préparer-proxmox-une-fois)
4. [Créer et régler la stack](#4-créer-et-régler-la-stack)
5. [Variables d'application](#5-variables-dapplication)
6. [Déployer](#6-déployer)
7. [Vérifier](#7-vérifier)
8. [DNS et certificats](#8-dns-et-certificats)
9. [Opérations courantes](#9-opérations-courantes)
10. [Montée en charge et test de charge](#10-montée-en-charge-et-test-de-charge)
11. [Migrer la prod depuis Dokploy](#11-migrer-la-prod-depuis-dokploy)
12. [Dépannage](#12-dépannage)
13. [Tout supprimer](#13-tout-supprimer)

---

## 1. Vue d'ensemble

```
Poste (Pulumi, bun, kubectl)
   │  API Proxmox :8006           SSH :22
   ▼                               ▼
Proxmox ──clone template 9000──► VM server (K3s server)  192.168.0.160
                               └► VM worker-N (K3s agent) 192.168.0.161…
                                     │
                                     ├─ ingress-nginx (ports 80/443 de chaque nœud)
                                     ├─ cert-manager (Let's Encrypt ou CA locale)
                                     └─ namespace bns : api ×2–6, web ×2–4, chat-service,
                                        search-indexer, mongodb (rs0), redis, meilisearch
```

| Élément | Où |
|---|---|
| Programme Pulumi | `infra/src/` (`index.ts` choisit aws, azure ou proxmox) |
| VM et K3s | `infra/src/proxmox-k3s.ts` |
| Déploiement de l'application | `infra/src/kubernetes/{apps,nginx}.ts` |
| Catalogue des variables | `infra/src/app-env.ts` (chaque variable : secrète ou non, services, calculée, Compose uniquement) |
| `.env` → stack | `infra/scripts/env-to-stack.ts` (`bun run env:check` / `env:apply`) |
| Template Proxmox | `infra/scripts/create-proxmox-template.sh` |
| Test de charge | `infra/loadtest/traffic.js` (`bun run loadtest`) |

**Stacks** (une stack = un environnement, avec ses VM, sa config et ses secrets) :

| Stack | Usage | Domaine | Certificat | VM (IDs / IP) |
|---|---|---|---|---|
| `proxmox-staging` | essais sur le réseau local | `buynsellem.lan` (Pi-hole) | `local-ca` | 250+ / 192.168.0.160+ |
| `proxmox-prod` | prod après migration | `buynsellem.com` | `letsencrypt` | 300+ / 192.168.0.170+ |

> Toujours passer `--stack <nom>`, ou faire `pulumi stack select <nom>` d'abord :
> sans ça, `pulumi config set` écrit dans la stack sélectionnée, pas forcément celle voulue.

---

## 2. Prérequis

### Sur le poste
```bash
curl -fsSL https://get.pulumi.com | sh        # CLI Pulumi
# bun, kubectl, k6 (test de charge), dig
cd infra && bun install
```

### Réseau
Le poste doit joindre l'API Proxmox (`192.168.0.101:8006`) **et** les VM en SSH
(`192.168.0.160+`).

- Sur le réseau local : rien à faire.
- À distance par Tailscale : publier le sous-réseau depuis le nœud.
  ```bash
  # sur le nœud
  echo 'net.ipv4.ip_forward = 1' > /etc/sysctl.d/99-tailscale.conf && sysctl -p /etc/sysctl.d/99-tailscale.conf
  tailscale set --advertise-routes=192.168.0.0/24
  ```
  Approuver la route dans la console Tailscale (machine *pve* → ⋯ → *Edit route
  settings* → cocher `192.168.0.0/24`). Sur un poste Linux, lancer ensuite
  `sudo tailscale set --accept-routes`.

### Clé SSH dédiée
Pulumi se connecte aux VM pour installer K3s.
```bash
ssh-keygen -t ed25519 -f ~/.ssh/bns-k3s -N "" -C "bns-k3s-pulumi"   # sans phrase de passe
```

---

## 3. Préparer Proxmox (une fois)

### 3.1 DNS du nœud
Si Tailscale gère le DNS (`/etc/resolv.conf` → `100.100.100.100`) et que
`ping deb.debian.org` échoue :
```bash
tailscale set --accept-dns=false
printf 'nameserver 192.168.0.98\nnameserver 1.1.1.1\n' > /etc/resolv.conf   # Pi-hole puis secours
```
Régler aussi le DNS dans l'interface : *nœud → Système → DNS*.

### 3.2 Template cloud-init (VM 9000)
```bash
scp infra/scripts/create-proxmox-template.sh root@192.168.0.101:/root/
ssh root@192.168.0.101 'VMID=9000 STORAGE=local-lvm BRIDGE=vmbr0 bash /root/create-proxmox-template.sh'
```
Le script installe `libguestfs-tools` (en lançant d'abord `apt-get update`),
télécharge Ubuntu 24.04, y installe `qemu-guest-agent`, vide le machine-id et
crée le template (disque de boot `scsi0`, lecteur cloud-init `ide2`, console
série). Vérification :
```bash
qm config 9000 | grep -E 'template|scsi0|ide2|agent|boot'
```
Ne pas agrandir le disque du template : chaque clone l'agrandit à la taille de
son profil.

### 3.3 Rôle, utilisateur et token API
Proxmox 9 (sur 8, remplacer `VM.GuestAgent.Audit` par `VM.Monitor`).
`Sys.Console` est nécessaire à cause de la console série du template.
```bash
PRIVS="VM.Allocate VM.Clone VM.Audit VM.PowerMgmt VM.Config.CDROM VM.Config.CPU VM.Config.Cloudinit VM.Config.Disk VM.Config.HWType VM.Config.Memory VM.Config.Network VM.Config.Options VM.GuestAgent.Audit Datastore.AllocateSpace Datastore.Audit SDN.Use Sys.Audit Sys.Console"
if pveum role list --output-format json | grep -q '"roleid":"PulumiK3s"'; then
  pveum role modify PulumiK3s -privs "$PRIVS"
else
  pveum role add PulumiK3s -privs "$PRIVS"
fi
pveum user add pulumi@pve 2>/dev/null || true
pveum aclmod / -user pulumi@pve -role PulumiK3s
pveum user token add pulumi@pve bns --privsep 0     # noter "value" : affichée une seule fois
```
Le token complet s'écrit `pulumi@pve!bns=<value>`. Modifier le rôle vaut aussi
pour les tokens existants. Pour ajouter un seul droit :
`pveum role modify PulumiK3s -append 1 -privs <Droit>`.

---

## 4. Créer et régler la stack

```bash
pulumi login --local                         # ou Pulumi Cloud
export PULUMI_CONFIG_PASSPHRASE='…'           # à conserver : sans elle, secrets illisibles
pulumi stack init proxmox-staging             # ou: pulumi stack select proxmox-staging
S=proxmox-staging
```

Les valeurs Proxmox non secrètes sont dans `infra/Pulumi.proxmox-staging.yaml`
(endpoint, `nodeName`, `templateVmId`, `firstVmId`, `datastoreId`, `bridge`,
`gateway`, `sshUser`, `controlPlaneIp`, `workerIps`, `k3sVersion`). À ajuster
avant le premier déploiement : **les IP et les IDs doivent être libres** :
```bash
for ip in 160 161 162; do ping -c1 -W1 192.168.0.$ip >/dev/null && echo "192.168.0.$ip OCCUPÉE"; done
qm list | awk '$1>=250 && $1<=252'           # sur le nœud
```

Secrets et réglages (le `--` est obligatoire avant une valeur qui commence par `-`) :
```bash
pulumi config set --stack $S --secret proxmox:apiToken -- 'pulumi@pve!bns=<value>'
pulumi config set --stack $S --secret proxmox:sshPrivateKey < ~/.ssh/bns-k3s
pulumi config set --stack $S proxmox:sshPublicKey -- "$(cat ~/.ssh/bns-k3s.pub)"

# Domaine privé (.lan) : CA locale et DNS des VM sur le Pi-hole
pulumi config set --stack $S tlsIssuer local-ca
pulumi config set --stack $S --path 'proxmox:dnsServers[0]' 192.168.0.98

# Taille : profil small (2 vCPU, 4 Go, 40 Go) | medium (4, 8, 64) | large (8, 16, 100)
pulumi config set --stack $S instanceType small
pulumi config set --stack $S nodeCount 1               # nombre de workers (+1 serveur)

# Autoscaling (facultatif ; par défaut api 2–6, web 2–4)
pulumi config set --stack $S --path autoscaling.api.max 6
```

Vérifier la stack :
```bash
pulumi config --stack $S
grep sshPrivateKey Pulumi.$S.yaml      # doit afficher "secure: …"
```

> **Règles de taille.** Un disque Proxmox s'agrandit mais ne se réduit jamais :
> passer de `medium` à `small` sur des VM existantes échoue (`Cannot shrink`).
> Choisir le profil avant le premier `up`, ou recréer les VM (§ 12).
> Prévoir la mémoire du nœud : 3 VM `medium` = 24 Go.

---

## 5. Variables d'application

Les variables viennent du `.env` de l'environnement Dokploy correspondant. On
ne les tape jamais à la main.

### 5.1 Préparer le fichier (à la racine du dépôt)
Les fichiers `.env.*` sont ignorés par git, sauf les `.env.example`.
```bash
# Dokploy → projet → Environment → copier tout le contenu dans :
.env.proxmox-staging      # ou .env.prod pour la prod
```
Ajouter les deux lignes propres à Pulumi :
```bash
GHCR_TOKEN=ghp_…          # GitHub classic token, read:packages
ACME_EMAIL=…              # seulement avec tlsIssuer letsencrypt
```
Ajuster :
- **`WEB_DOMAIN`** : le domaine de *ce* cluster. Deux déploiements ne peuvent
  pas partager un domaine. `www.`, `api.` et `chat.` en sont dérivés : supprimer
  `WEB_WWW_DOMAIN`, `API_DOMAIN` et `CHAT_DOMAIN`, ou les mettre exactement à ces
  valeurs.
- **`STORAGE_PROVIDER=s3`** (ou `azure`), avec `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_PRIVATE_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID` et
  `S3_SECRET_ACCESS_KEY` joignables **depuis les VM**. Le stockage `local` est
  refusé : l'API tourne sur plusieurs pods sans disque partagé.
- **Novu** : un environnement de test doit avoir son propre environnement Novu
  (`NOVU_SECRET_KEY`, `NOVU_APPLICATION_IDENTIFIER`), sinon il réécrit les
  workflows de Dokploy. On peut aussi retirer ces deux lignes.
- **Bucket S3** : un environnement de test ne doit pas écrire dans le bucket de
  la prod.

### 5.2 Vérifier puis appliquer
```bash
# depuis la racine
bun run infra:env:check --env .env.proxmox-staging --stack proxmox-staging
bun run infra:env:apply --env .env.proxmox-staging --stack proxmox-staging
# ou depuis infra/ : bun run env:check|env:apply --env ../.env.proxmox-staging --stack …
```
`env:check` ne modifie rien. Il refuse le fichier dans ces cas :
- une variable absente du catalogue (l'ajouter dans `infra/src/app-env.ts`) ;
- une variable obligatoire manquante ;
- une variable définie deux fois ;
- un domaine incohérent ;
- un stockage local.

Il signale aussi les variables ignorées volontairement : celles calculées par
la stack (`DATABASE_URI`, `REDIS_URL`, URLs publiques…) et celles réservées à
Compose. `env:apply` remplace entièrement `appEnv` et `appSecrets` (chiffrés),
ainsi que `domain`, `ghcrToken`, `acmeEmail`, `imageRegistry` et `imageTag`.
Une fois la stack choisie, il affiche les ajouts, modifications et suppressions,
sans jamais afficher les valeurs secrètes.

---

## 6. Déployer

```bash
pulumi preview --stack $S       # ~45 ressources : 2–3 VM, K3s, cluster
pulumi up --stack $S
```
Durée : 10 à 20 min. Ordre :
1. clone et démarrage des VM ;
2. cloud-init ;
3. installation de K3s (version figée, sans Traefik) et attente des nœuds `Ready` ;
4. cert-manager et ingress-nginx (Helm, 15 min de délai) ;
5. MongoDB (replica set `rs0`), Redis et Meilisearch ;
6. api, web, chat-service, search-indexer et Ingress.

Si une étape échoue, corriger puis relancer `pulumi up` : ce qui est fait n'est
pas refait. `pulumi refresh --yes` resynchronise l'état si des VM ont été
modifiées ou supprimées à la main.

Récupérer le kubeconfig :
```bash
mkdir -p ~/.kube
ssh -i ~/.ssh/bns-k3s ubuntu@192.168.0.160 'sudo cat /etc/rancher/k3s/k3s.yaml' \
  | sed 's/127.0.0.1/192.168.0.160/' > ~/.kube/bns-staging.yaml
chmod 600 ~/.kube/bns-staging.yaml
export KUBECONFIG=~/.kube/bns-staging.yaml
```
Sans kubeconfig, tout `kubectl` passe aussi par le serveur :
`ssh ubuntu@192.168.0.160 sudo k3s kubectl …`.

---

## 7. Vérifier

```bash
kubectl get nodes -o wide                    # tous Ready
kubectl -n bns get pods                      # tous Running 1/1
kubectl -n bns get hpa                       # api et web, TARGETS en %
kubectl get certificate -A                   # bns-tls READY=True
kubectl -n bns logs deploy/api --tail=50     # "Ready in …", pas d'erreur Mongo/S3

# Les routes, en forçant la résolution vers un nœud (avant le DNS)
curl -sk --resolve api.buynsellem.lan:443:192.168.0.161 https://api.buynsellem.lan/api/public/config | head -c 200; echo
curl -sk --resolve buynsellem.lan:443:192.168.0.161 -o /dev/null -w '%{http_code}\n' https://buynsellem.lan/
```
`curl http://<ip>` sans nom renvoie un `404 nginx` : c'est normal, l'Ingress
aiguille les requêtes par nom de domaine.

---

## 8. DNS et certificats

### Domaine privé (Pi-hole, `tlsIssuer: local-ca`)
Dans Pi-hole, aller dans *Local DNS → DNS Records* et faire pointer les quatre
noms vers **l'IP d'un nœud**. ServiceLB de K3s expose les ports 80 et 443 sur
chaque nœud.

| Domain | IP |
|---|---|
| `buynsellem.lan` | `192.168.0.161` |
| `www.buynsellem.lan` | `192.168.0.161` |
| `api.buynsellem.lan` | `192.168.0.161` |
| `chat.buynsellem.lan` | `192.168.0.161` |

Variante : un seul enregistrement A pour `buynsellem.lan`, plus des *CNAME
Records* `www`, `api` et `chat` qui pointent vers `buynsellem.lan`. Aucun
enregistrement n'est nécessaire pour MongoDB, Redis ou Meilisearch, qui
restent internes au cluster.

Exporter la CA locale (valable 10 ans), puis l'approuver sur chaque appareil :
```bash
kubectl -n cert-manager get secret bns-local-ca -o jsonpath='{.data.ca\.crt}' | base64 -d > bns-local-ca.crt
sudo cp bns-local-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates   # Linux
# macOS : Trousseau → Toujours approuver ; Android/iOS : installer le profil puis activer la confiance
```

### Domaine public (`tlsIssuer: letsencrypt`)
- Chez le registrar : enregistrements A `@`, `www`, `api`, `chat` → IP publique.
- Sur la box : redirection des ports **80 et 443** vers un nœud K3s.
- Let's Encrypt valide par HTTP. Pour suivre l'émission :
  `kubectl get certificate -A`, puis
  `kubectl describe certificate bns-tls -n bns`.

---

## 9. Opérations courantes

### Changer une variable
Modifier le `.env`, puis :
```bash
bun run infra:env:check --env .env.proxmox-staging --stack $S
bun run infra:env:apply --env .env.proxmox-staging --stack $S
pulumi up --stack $S        # les pods redémarrent (checksum des variables)
```

### Déployer une nouvelle version
La CI publie à chaque push sur `dev` les tags `dev` et `dev-<sha>`. Sur un
tag `v*`, elle publie `<version>` et `latest`.
- **Staging** (`imageTag: dev`) : les conteneurs ont `imagePullPolicy: Always`,
  donc un redémarrage suffit.
  ```bash
  kubectl -n bns rollout restart deploy/api deploy/web deploy/chat-service deploy/search-indexer
  kubectl -n bns rollout status deploy/api
  ```
- **Prod** : utiliser un tag immuable, puis lancer `pulumi up`.
  ```bash
  pulumi config set --stack proxmox-prod imageTag 1.1.2      # ou dev-<sha>
  ```
  Pour revenir en arrière, repasser au tag précédent et relancer `pulumi up`.

### Réindexer la recherche
```bash
kubectl -n bns exec deploy/search-indexer -- bun run src/reindex.ts
```

### Ajouter un worker
```bash
pulumi config set --stack $S nodeCount 2
pulumi config set --stack $S --path 'proxmox:workerIps[1]' 192.168.0.162
pulumi up --stack $S
```
Retirer un worker (baisser `nodeCount`) supprime sa VM et son nœud Kubernetes.
Les pods sont replanifiés ailleurs, mais **pas les données** des StatefulSets
qui tournaient dessus (stockage local-path, cf. § 12).

### Agrandir les VM
`small` → `medium` → `large` se fait en place avec `pulumi up`. Réduire
impose de recréer les VM.

### Sauvegarder MongoDB
```bash
PASS=$(pulumi config get --stack $S --path appSecrets.MONGO_PASSWORD)
kubectl -n bns exec mongodb-0 -- mongodump -u bns -p "$PASS" --authenticationDatabase admin --archive --gzip > bns-$(date +%F).archive.gz
```

---

## 10. Montée en charge et test de charge

L'API (2 à 6 pods) et le web (2 à 4 pods) ajoutent des pods quand le CPU
dépasse 70 % de ce que chaque pod réserve. Un pod est ajouté en moins d'une
minute. Les pods en trop sont retirés après 5 minutes de calme. MongoDB,
Redis, Meilisearch et chat-service restent à 1 instance.

```bash
# terminal 1
kubectl -n bns get hpa -w
# terminal 2
kubectl -n bns top pods
# terminal 3 (depuis infra/)
bun run loadtest -e DOMAIN=buynsellem.lan               # monte à 150 visiteurs
bun run loadtest -e DOMAIN=buynsellem.lan -e PEAK=400   # plus fort
```
Les seuils du scénario : moins de 1 % d'erreurs et un temps de réponse
inférieur à 1,5 s au 95e centile. Si les nouveaux pods restent `Pending`, les
nœuds sont pleins : ajouter un worker ou agrandir les VM.

---

## 11. Migrer la prod depuis Dokploy

1. **Stack** : `pulumi stack init proxmox-prod`. Copier les réglages
   `proxmox:*` en changeant `firstVmId` (300), les IP (`.170+`) et les tailles.
   Garder `tlsIssuer` sur `letsencrypt` (la valeur par défaut). Enregistrer le
   token et les clés SSH (§ 4).
2. **Variables** : copier l'*Environment* Dokploy prod dans `.env.prod`. Ajouter
   `GHCR_TOKEN` et `ACME_EMAIL`. Mettre `imageTag` sur une version (§ 9).
   Lancer `env:check`, puis `env:apply`. Les peppers et secrets de hachage
   (`RISK_HASH_SECRET`, `ORDER_PHONE_PEPPER`, `VERIFICATION_HASH_PEPPER`)
   doivent être **identiques** à la prod, sinon les données hachées
   existantes deviennent illisibles.
3. **Déployer** : `pulumi up --stack proxmox-prod`. Le cluster tourne alors à
   vide, à côté de Dokploy.
4. **Fenêtre de bascule** : mettre Dokploy en maintenance (arrêter l'API pour
   figer la base).
5. **Données MongoDB** :
   ```bash
   # côté Dokploy (conteneur mongodb)
   docker exec <mongodb> mongodump -u "$MONGO_USER" -p "$MONGO_PASSWORD" --authenticationDatabase admin --archive --gzip > prod.archive.gz
   # côté cluster
   PASS=$(pulumi config get --stack proxmox-prod --path appSecrets.MONGO_PASSWORD)
   kubectl -n bns exec -i mongodb-0 -- mongorestore -u bns -p "$PASS" --authenticationDatabase admin --archive --gzip --drop < prod.archive.gz
   kubectl -n bns rollout restart deploy/api
   ```
6. **Fichiers** : rien à copier si la prod est déjà sur S3 ou RustFS (même bucket).
7. **Recherche** : réindexer (§ 9).
8. **DNS** : faire pointer les enregistrements publics et les redirections 80/443
   vers le nouveau cluster. Suivre l'émission du certificat Let's Encrypt.
9. **Vérifier** (§ 7), puis tester un parcours complet : connexion, annonce,
   commande, paiement en sandbox et message.
10. **Garder Dokploy arrêté mais intact** quelques jours pour pouvoir revenir en
    arrière (repointer le DNS).

---

## 12. Dépannage

| Symptôme | Cause | Correctif |
|---|---|---|
| `Temporary failure resolving` sur le nœud | DNS Tailscale (`100.100.100.100`) | § 3.1 |
| `apt` : `404 Not Found` | liste des paquets périmée | `apt-get update` |
| `failed to locate the entry point` | `main` manquant dans `package.json` | corrigé (`src/index.ts`) |
| `bad flag syntax: -----BEGIN…` | valeur prise pour une option | `pulumi config set … -- "<valeur>"` ou `< fichier` |
| `Missing required configuration variable` | valeur dans une autre stack | `pulumi config --stack $S`, voir § 4 |
| `appSecrets.X is missing` | variables non appliquées | § 5.2 |
| `403 Permission check failed (/, Sys.Console)` | droit manquant | § 3.3 |
| `unable to create VM 200: config file already exists` | ID déjà pris | changer `proxmox:firstVmId`, ou supprimer *ses propres* VM |
| `QEMU exited with code 1` | voir `qm start <id>` sur le nœud | — |
| … `'host_cdrom' block driver requires a file name` | lecteur CD physique absent | corrigé (`cdrom: none`) |
| `Cannot shrink … disk` | profil réduit sur des VM existantes | recréer les VM (ci-dessous) |
| SSH : `no route to host` | VM éteinte, IP non appliquée ou route manquante | `qm status`, `qm cloudinit dump <id> network`, route Tailscale |
| ConfigMap : `cannot unmarshal number` | valeurs numériques dans la config | corrigé (conversion en texte) |
| Helm `context deadline exceeded` | images lentes à télécharger | délai porté à 15 min ; relancer |
| `x509: certificate signed by unknown authority` (webhook nginx) | webhook resté d'une release en échec | `kubectl get validatingwebhookconfiguration -o name \| grep ingress-nginx \| xargs kubectl delete`, puis `pulumi up` |
| cert-manager webhook `502` | webhook pas encore démarré | relancer `pulumi up` |
| `api` jamais `Ready` | variables manquantes (S3…) | `kubectl -n bns logs deploy/api` |
| `404 nginx` sur `curl http://<ip>` | pas de nom de domaine | § 7 (`--resolve`) |
| Novu `Workflow limit exceeded` | limite de l'offre Novu ou environnement Novu partagé | environnement Novu dédié (§ 5.1) |
| Pods `Pending` sous charge | nœuds pleins | ajouter un worker ou agrandir |

### Recréer les VM d'un cluster de test
```bash
pulumi up --stack $S \
  --replace "$(pulumi stack --stack $S --show-urns | grep -o 'urn:[^ ]*VirtualMachine::bns-proxmox-staging-server')" \
  --replace "$(pulumi stack --stack $S --show-urns | grep -o 'urn:[^ ]*VirtualMachine::bns-proxmox-staging-worker-1')"
```
Les données des VM recréées sont perdues : MongoDB, Redis et Meilisearch
utilisent le stockage local-path de K3s, attaché à un nœud.

### Diagnostics utiles
```bash
qm start <id>; qm status <id>; qm config <id>; qm cloudinit dump <id> network   # nœud Proxmox
qm terminal <id>                                    # console série, sortie Ctrl+O
kubectl get pods -A -o wide | grep -v Completed
kubectl -n bns describe pod -l app=api | grep -A12 Events
ssh ubuntu@192.168.0.161 'sudo systemctl status k3s-agent --no-pager | tail -15'
```

---

## 13. Tout supprimer

```bash
pulumi destroy --stack $S        # supprime le cluster et ses VM (données incluses)
pulumi stack rm $S               # supprime la stack et sa config
```
Le template 9000, le rôle et le token Proxmox ne sont pas touchés.
