# Runbook — MongoDB single-node replica set

**Superseded: the replica set is now automatic.** The procedure this file used
to describe (create a key file on the host, set `MONGO_REPLICA_SET` and
`MONGO_KEYFILE_PATH`, run `rs.initiate`) is no longer needed anywhere.

## What the compose files do

In `docker-compose.yml`, `docker-compose.local.yml` and
`deployments/docker-compose/docker-compose.yml`, the `mongodb` service:

1. generates a 756-character key file into the `mongo_keyfile` volume on its
   first start (mode `400`, owner `999:999`), and reuses it afterwards;
2. always starts `mongod --replSet ${MONGO_REPLICA_SET:-rs0} --keyFile …`;
3. has a healthcheck that, authenticated as the root user, runs `rs.initiate`
   with the member `${MONGO_REPLICA_HOST:-mongodb:27017}` when it finds the set
   uninitiated, and reports healthy only once the node is the writable primary.

`api` waits on that healthcheck, and its default `DATABASE_URI` carries
`&replicaSet=${MONGO_REPLICA_SET:-rs0}`, so Payload transactions are on.

Verified with `mongo:7`: an existing standalone database with authentication is
converted in place on the next deploy (data kept, healthy in ~11 s, a
multi-document transaction commits), and a fresh volume comes up the same way.

## Upgrading a host that followed the old procedure

Nothing to do. The old `MONGO_KEYFILE_PATH` is ignored; a single-node set does
not care that its key file changed, and the existing replica-set configuration
(`rs0`, member `mongodb:27017`) is reused as is.

## Rollback

Point the API at the node without the replica set, e.g. in `.env`:

```
DATABASE_URI=mongodb://<user>:<password>@mongodb:27017/<db>?authSource=admin
```

Transactions go back to being silently disabled; `mongod` stays a replica set,
which is harmless. To restore data, `mongorestore` a `mongodump --archive`
taken beforehand.

## If something looks wrong

| Symptom | Cause |
| --- | --- |
| `mongodb` never turns healthy, `rs.status()` says the member is not reachable | The api reaches Mongo under another name than `mongodb:27017`; set `MONGO_REPLICA_HOST`, then `rs.reconfig` once. |
| `mongodb` never turns healthy, authentication fails in the healthcheck | `MONGO_PASSWORD` changed after the volume was created; the root user keeps the password it was created with. |
| `MONGO_IMAGE` pinned below 5 | No `mongosh`; use `mongo:7`. |
