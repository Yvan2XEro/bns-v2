# Runbook — turning a BNS host's MongoDB into a single-node replica set

For whoever operates the staging and production servers. It takes one host from a
standalone `mongod` to a single-node replica set, which is what makes MongoDB
multi-document transactions work. Payload only enables transactions when
`DATABASE_URI` names a `replicaSet`; without one, everything P0 relies on —
payment settlement, the account deletion cascade, the migrations — runs without a
transaction and a half-failed write stays half-written.

Run it on staging first, live with it, then production.

## What the compose change already did

The replica set is **off by default**. `deployments/docker-compose/docker-compose.yml`
reads two variables:

| Variable | Empty (default) | Set |
| --- | --- | --- |
| `MONGO_REPLICA_SET` | `mongod --bind_ip_all`, `DATABASE_URI` without `replicaSet` | adds `--replSet <name> --keyFile …` and `&replicaSet=<name>` |
| `MONGO_KEYFILE_PATH` | mounts `/dev/null` at the key-file path (unused) | mounts that host file read-only |

So merging and deploying the change does not switch anything on. Everything below
is the deliberate, per-host act of switching it on.

## Prerequisites

- Shell access to the host and the deploy directory: `$STAGING_PATH` on staging,
  `$DEPLOY_PATH` on production — the directory that holds `docker-compose.yml`
  and `.env`, the one CI deploys into.
- `docker compose version` reports Compose **v2**. The compose file uses
  `${VAR:+…}` with a nested variable; v2 handles it (validated against v2.40),
  v1 does not.
- The image is MongoDB **5 or newer**. The healthcheck runs `mongosh` and
  `db.hello()`; a host pinning `MONGO_IMAGE` to MongoDB 4 has neither, so
  `mongodb` would never report healthy. The default is `mongo:7`.
- A maintenance window (see the next section) and a fresh backup.
- The database credentials already in `.env`: `MONGO_USER`, `MONGO_PASSWORD`,
  `MONGO_DB`.

## Downtime: what actually happens

Be honest with whoever is watching the site.

- **On the first deploy after the merge, even with the switch off**, compose
  recreates the `mongodb` container, because its `command`, volumes and
  healthcheck changed. That is a short restart — seconds — and `api` reconnects.
- **When you switch it on**, `mongod` restarts as a replica set member *with no
  configuration yet*. In that state it is not usable and the healthcheck reports
  it unhealthy on purpose. `api` and `mongo-express` both declare
  `depends_on: mongodb: condition: service_healthy`, so **the site is down from
  that restart until `rs.initiate` has run** — step 5 to step 7 below, a couple of
  minutes if you run them back to back. Have the commands ready and paste them
  one after the other; do not start this and walk away.
- If the switch is turned on through a **deploy** rather than by hand, that
  deploy job can go **red**: it runs `docker compose up -d` and waits on a
  `mongodb` that is not healthy yet. That red job is expected and is not a
  failure — run `rs.initiate`, then re-run the deploy or `docker compose up -d`
  on the host and confirm everything is healthy.

## The procedure, in order

Do these on one host, top to bottom.

### 1. Back up, and copy the backup off the host

```bash
cd "$STAGING_PATH"   # or "$DEPLOY_PATH" on production
docker compose exec -T mongodb sh -c 'mongodump --archive --gzip -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' > "bns-$(date +%Y%m%d-%H%M).archive.gz"
ls -lh bns-*.archive.gz
```

Then, from your workstation: `scp <host>:<path>/bns-*.archive.gz .`

Check: the archive is non-empty on both machines.

### 2. Check the toolchain

```bash
docker compose version
grep -E '^MONGO_IMAGE=' .env || echo "MONGO_IMAGE not pinned — default mongo:7"
docker compose config --quiet
```

Check: Compose v2; no `MONGO_IMAGE` pin below MongoDB 5; `config --quiet` prints
nothing.

### 3. Create the key file

A replica set with authentication needs a shared key file, and `mongod` refuses
one that is group- or world-readable. `999:999` is the `mongodb` user inside the
`mongo:7` image.

```bash
openssl rand -base64 756 > mongo-keyfile
chmod 400 mongo-keyfile
sudo chown 999:999 mongo-keyfile
ls -l mongo-keyfile
```

Check: `-r-------- 1 999 999 … mongo-keyfile`, in the same directory as
`docker-compose.yml`. It is in `.gitignore`; it never goes into the repository.

Do this **before** the next step. With no file at that path, Docker creates a
root-owned *directory* there and `mongod` crash-loops until you `sudo rm -rf` it.

### 4. Turn the switch on, where it will survive

Both variables together. `MONGO_REPLICA_SET` without `MONGO_KEYFILE_PATH` mounts
`/dev/null` as the key file and `mongod` dies on "permissions are too open",
which reads like a permissions bug rather than a missing path. Compose cannot
express that guard, so it is on you.

- **Staging.** The deploy job rewrites `.env` on the host from GitHub on every
  push to `dev`, so editing `.env` there is undone by the next deploy. Set them
  in GitHub instead — repository or `staging` environment **variables**:
  `MONGO_REPLICA_SET=rs0` and `MONGO_KEYFILE_PATH=./mongo-keyfile`. Then either
  let the next `dev` push write the `.env`, or write the two lines into `.env`
  by hand now so you can finish the window immediately — the GitHub variables are
  what keeps them there afterwards.
- **Production.** No job writes that `.env`; edit it on the host:

  ```bash
  printf 'MONGO_REPLICA_SET=%s\n' 'rs0'            >> .env
  printf 'MONGO_KEYFILE_PATH=%s\n' './mongo-keyfile' >> .env
  ```

Check: `docker compose config | grep -E 'replSet|keyfile|replicaSet='` shows
`--replSet rs0`, the key file bind mount, and a `DATABASE_URI` ending in
`&replicaSet=rs0`.

### 5. Restart MongoDB — the window starts here

```bash
docker compose up -d mongodb
docker compose logs --tail=50 mongodb
```

Check: `mongod` is up and waiting, with **no** key-file permission error.
`docker compose ps mongodb` says unhealthy — that is correct at this point, the
set has no configuration yet. Go straight to the next step.

### 6. Initiate the replica set, once

The member host must be `mongodb:27017`, the compose service name: the `api`
container reads the member list out of this configuration and has to be able to
reach it on the compose network. `localhost` here would leave `api` unable to
connect.

```bash
docker compose exec mongodb sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "rs.initiate({ _id: \"rs0\", members: [{ _id: 0, host: \"mongodb:27017\" }] })"'
docker compose exec mongodb sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "rs.status().members[0].stateStr"'
docker compose ps mongodb
```

Check: `{ ok: 1 }`, then `PRIMARY`, then `healthy` within a minute. This is run
once per host, ever; a later restart, or switching back and forth, does not need
it again.

### 7. Restart the applications — the window ends here

```bash
docker compose up -d
docker compose exec api printenv DATABASE_URI | grep -c "replicaSet=rs0"
docker compose logs --since 5m api | grep -Ei "error|migration" | head -50
```

Check: `1`, `api` starts clean, `docker compose ps` all healthy, and the site
answers.

### 8. Prove transactions are really live

The API image is a Next.js standalone build without `src/scripts`, so the
Payload-level probe (`packages/api/src/scripts/transactionProbe.ts`, run by the
`mongo-transactions` CI job) does not exist in the container. On the host, prove
it at the database level:

```bash
docker compose exec mongodb sh -c 'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin "$MONGO_INITDB_DATABASE" --eval "
const marker = \"tx-probe-\" + Date.now();
const session = db.getMongo().startSession();
const sdb = session.getDatabase(db.getName());
session.startTransaction();
sdb.tx_probe_a.insertOne({ marker });
sdb.tx_probe_b.insertOne({ marker });
session.abortTransaction();
const leaked = db.tx_probe_a.countDocuments({ marker }) + db.tx_probe_b.countDocuments({ marker });
db.tx_probe_a.drop(); db.tx_probe_b.drop();
print(leaked === 0 ? \"PROBE OK\" : \"PROBE FAILED: \" + leaked);
"'
```

Check: `PROBE OK`.

### 9. Watch it

For at least 24 hours on staging, exercise listings, moderation, phone reveals,
reviews, an account deletion that has a boost payment, and a sandbox boost
purchase. Daily:

```bash
docker compose logs --since 24h api | grep -Ei "WriteConflict|NoSuchTransaction|TransientTransactionError"
```

Check: no matches, or matches you have explained. Only then do the same on
production.

## Rollback

**Level 1 — back to standalone.** Empty the switch where you set it (the GitHub
variables for staging, `.env` for production; on staging also empty the two lines
in the host `.env` so the change takes effect before the next deploy), then:

```bash
docker compose up -d mongodb api chat-service search-indexer
```

`mongod` comes back standalone with the data intact, and transactions go back to
being silently disabled. The replica-set configuration stays behind in the
`local` database, which is harmless — re-enabling later does not need a second
`rs.initiate`.

**Level 2 — restore.** If the data itself is wrong, restore the step 1 archive:

```bash
docker compose exec -T mongodb sh -c 'mongorestore --archive --gzip --drop -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' < bns-<timestamp>.archive.gz
```

## If something looks wrong

| Symptom | Cause |
| --- | --- |
| `mongod` exits on "permissions on … are too open" | `MONGO_REPLICA_SET` set with an empty `MONGO_KEYFILE_PATH`, so `/dev/null` was mounted as the key file; or the key file is not `400` / not owned by `999:999`. |
| A root-owned `mongo-keyfile` directory appeared | Compose started before step 3. `sudo rm -rf mongo-keyfile`, then redo step 3. |
| `mongodb` stays unhealthy after `rs.initiate` | Check `rs.status()`; the member host must be `mongodb:27017`. Reconfigure with `rs.reconfig`. |
| `mongodb` never goes healthy, no replica-set error | `MONGO_IMAGE` pinned below MongoDB 5 — no `mongosh`, no `db.hello()`. |
| `api` cannot connect but `mongodb` is healthy | The member is advertised under a host `api` cannot resolve — again, it must be `mongodb:27017`. |
| The deploy job is red, the site is up and healthy | The job raced the unhealthy `mongodb` during the window. Re-run it. |
