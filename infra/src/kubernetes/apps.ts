import { createHash } from "node:crypto";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { type AppService, appEnvFor } from "../app-env";
import type { ReplicaRange } from "../config";

export interface AppsConfig {
	imageRegistry: string;
	imageTag: string;
	domain: string;
	ghcrToken: pulumi.Output<string>;
	/** Plain values of the production `.env` (`appEnv`). */
	appEnv: Record<string, string>;
	/** Secret values of the production `.env` (`appSecrets`). */
	appSecrets: pulumi.Output<Record<string, string>>;
	mongoUser: string;
	mongoDb: string;
	meiliEnv: string;
	mongoPassword: pulumi.Output<string>;
	redisPassword: pulumi.Output<string>;
	meiliMasterKey: pulumi.Output<string>;
	autoscaling: { api: ReplicaRange; web: ReplicaRange };
	provider: k8s.Provider;
}

/** Kubernetes objects holding the `.env` values. */
const ENV_SECRET = "bns-env";
const ENV_CONFIG_MAP = "bns-config";
/** Store credentials, kept apart from the app values. */
const STORE_SECRET = "bns-stores";

type EnvVar = k8s.types.input.core.v1.EnvVar;

function fromSecret(name: string, key: string, envName = key): EnvVar {
	return { name: envName, valueFrom: { secretKeyRef: { name, key } } };
}

/**
 * The catalog's variables for one service, read from the Secret or the
 * ConfigMap. `optional` lets a variable absent from the `.env` stay unset,
 * exactly as Compose leaves it.
 */
function passThroughEnv(service: AppService): EnvVar[] {
	return appEnvFor(service).map(({ name, secret }) =>
		secret
			? {
					name,
					valueFrom: {
						secretKeyRef: { name: ENV_SECRET, key: name, optional: true },
					},
				}
			: {
					name,
					valueFrom: {
						configMapKeyRef: {
							name: ENV_CONFIG_MAP,
							key: name,
							optional: true,
						},
					},
				},
	);
}

export function deployApps(cfg: AppsConfig): void {
	const { provider, imageRegistry: reg, imageTag: tag, domain } = cfg;
	const ns = "bns";
	const webOrigins = `https://${domain},https://www.${domain}`;

	const namespace = new k8s.core.v1.Namespace(
		"bns-ns",
		{ metadata: { name: ns } },
		{ provider },
	);

	const baseOpts = { provider, dependsOn: [namespace] };

	// Image pull secret (GHCR)
	const pullSecret = new k8s.core.v1.Secret(
		"ghcr-pull-secret",
		{
			metadata: { namespace: ns, name: "ghcr-pull-secret" },
			type: "kubernetes.io/dockerconfigjson",
			stringData: {
				".dockerconfigjson": cfg.ghcrToken.apply((token) =>
					JSON.stringify({
						auths: {
							"ghcr.io": {
								username: "x-access-token",
								password: token,
								auth: Buffer.from(`x-access-token:${token}`).toString("base64"),
							},
						},
					}),
				),
			},
		},
		baseOpts,
	);

	const storeSecret = new k8s.core.v1.Secret(
		"bns-stores",
		{
			metadata: { namespace: ns, name: STORE_SECRET },
			stringData: {
				MONGO_PASSWORD: cfg.mongoPassword,
				REDIS_PASSWORD: cfg.redisPassword,
				MEILI_MASTER_KEY: cfg.meiliMasterKey,
			},
		},
		baseOpts,
	);

	const envSecret = new k8s.core.v1.Secret(
		"bns-env",
		{
			metadata: { namespace: ns, name: ENV_SECRET },
			stringData: cfg.appSecrets,
		},
		baseOpts,
	);

	const envConfigMap = new k8s.core.v1.ConfigMap(
		"bns-config",
		{
			metadata: { namespace: ns, name: ENV_CONFIG_MAP },
			data: cfg.appEnv,
		},
		baseOpts,
	);

	// Pods read env only at start: a hash of every value in the pod template
	// rolls them whenever the `.env` changes.
	const envChecksum = pulumi
		.all([cfg.appSecrets, cfg.mongoPassword, cfg.redisPassword])
		.apply(([secrets, mongo, redis]) =>
			createHash("sha256")
				.update(JSON.stringify([cfg.appEnv, secrets, mongo, redis]))
				.digest("hex"),
		);
	const podAnnotations = { "bns/env-checksum": envChecksum };
	const appDeps = [namespace, pullSecret, storeSecret, envSecret, envConfigMap];

	// ─── Infrastructure ──────────────────────────────────────────────────────────

	// MongoDB — a single-node replica set, as in the Compose deployment:
	// Payload only runs multi-document transactions against one. An
	// authenticated replica set needs a key file; for one member it can be
	// fresh at every start. The readiness probe initiates the set once.
	const mongoInitiate =
		'mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval \'try { rs.status() } catch (e) { if (e.codeName !== "NotYetInitialized") throw e; rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongodb:27017" }] }) } quit(db.hello().isWritablePrimary ? 0 : 1)\'';
	new k8s.apps.v1.StatefulSet(
		"mongodb",
		{
			metadata: { namespace: ns, name: "mongodb" },
			spec: {
				serviceName: "mongodb",
				replicas: 1,
				selector: { matchLabels: { app: "mongodb" } },
				template: {
					metadata: { labels: { app: "mongodb" } },
					spec: {
						containers: [
							{
								name: "mongodb",
								image: "mongo:7",
								command: ["bash", "-c"],
								args: [
									[
										"set -e",
										"keyfile=/data/keyfile/mongo-keyfile",
										"tr -dc 'A-Za-z0-9+/' < /dev/urandom | head -c 756 > \"$keyfile\"",
										'chown 999:999 "$keyfile"',
										'chmod 400 "$keyfile"',
										'exec docker-entrypoint.sh mongod --bind_ip_all --replSet rs0 --keyFile "$keyfile"',
									].join("\n"),
								],
								env: [
									{ name: "MONGO_INITDB_ROOT_USERNAME", value: cfg.mongoUser },
									fromSecret(
										STORE_SECRET,
										"MONGO_PASSWORD",
										"MONGO_INITDB_ROOT_PASSWORD",
									),
									{ name: "MONGO_INITDB_DATABASE", value: cfg.mongoDb },
								],
								ports: [{ containerPort: 27017 }],
								readinessProbe: {
									exec: { command: ["bash", "-c", mongoInitiate] },
									initialDelaySeconds: 10,
									periodSeconds: 10,
									timeoutSeconds: 10,
								},
								volumeMounts: [
									{ name: "data", mountPath: "/data/db" },
									{ name: "keyfile", mountPath: "/data/keyfile" },
								],
								resources: {
									requests: { memory: "256Mi", cpu: "100m" },
									limits: { memory: "1Gi" },
								},
							},
						],
						volumes: [{ name: "keyfile", emptyDir: {} }],
					},
				},
				volumeClaimTemplates: [
					{
						metadata: { name: "data" },
						spec: {
							accessModes: ["ReadWriteOnce"],
							resources: { requests: { storage: "10Gi" } },
						},
					},
				],
			},
		},
		{ ...baseOpts, dependsOn: [namespace, storeSecret] },
	);

	new k8s.core.v1.Service(
		"mongodb-svc",
		{
			metadata: { namespace: ns, name: "mongodb" },
			spec: {
				selector: { app: "mongodb" },
				clusterIP: "None",
				// The replica set's member is `mongodb:27017`: it must resolve
				// before the pod is ready, or the set can never be initiated.
				publishNotReadyAddresses: true,
				ports: [{ port: 27017 }],
			},
		},
		baseOpts,
	);

	// Redis
	new k8s.apps.v1.StatefulSet(
		"redis",
		{
			metadata: { namespace: ns, name: "redis" },
			spec: {
				serviceName: "redis",
				replicas: 1,
				selector: { matchLabels: { app: "redis" } },
				template: {
					metadata: { labels: { app: "redis" } },
					spec: {
						containers: [
							{
								name: "redis",
								image: "redis:7-alpine",
								command: ["redis-server", "--requirepass", "$(REDIS_PASSWORD)"],
								env: [fromSecret(STORE_SECRET, "REDIS_PASSWORD")],
								volumeMounts: [{ name: "data", mountPath: "/data" }],
								resources: {
									requests: { memory: "64Mi", cpu: "50m" },
									limits: { memory: "256Mi" },
								},
							},
						],
					},
				},
				volumeClaimTemplates: [
					{
						metadata: { name: "data" },
						spec: {
							accessModes: ["ReadWriteOnce"],
							resources: { requests: { storage: "2Gi" } },
						},
					},
				],
			},
		},
		{ ...baseOpts, dependsOn: [namespace, storeSecret] },
	);

	new k8s.core.v1.Service(
		"redis-svc",
		{
			metadata: { namespace: ns, name: "redis" },
			spec: {
				selector: { app: "redis" },
				clusterIP: "None",
				ports: [{ port: 6379 }],
			},
		},
		baseOpts,
	);

	// Meilisearch
	new k8s.apps.v1.StatefulSet(
		"meilisearch",
		{
			metadata: { namespace: ns, name: "meilisearch" },
			spec: {
				serviceName: "meilisearch",
				replicas: 1,
				selector: { matchLabels: { app: "meilisearch" } },
				template: {
					metadata: { labels: { app: "meilisearch" } },
					spec: {
						containers: [
							{
								name: "meilisearch",
								image: "getmeili/meilisearch:latest",
								env: [
									fromSecret(STORE_SECRET, "MEILI_MASTER_KEY"),
									{ name: "MEILI_ENV", value: cfg.meiliEnv },
								],
								volumeMounts: [{ name: "data", mountPath: "/meili_data" }],
								resources: {
									requests: { memory: "256Mi", cpu: "100m" },
									limits: { memory: "1Gi" },
								},
							},
						],
					},
				},
				volumeClaimTemplates: [
					{
						metadata: { name: "data" },
						spec: {
							accessModes: ["ReadWriteOnce"],
							resources: { requests: { storage: "5Gi" } },
						},
					},
				],
			},
		},
		{ ...baseOpts, dependsOn: [namespace, storeSecret] },
	);

	new k8s.core.v1.Service(
		"meilisearch-svc",
		{
			metadata: { namespace: ns, name: "meilisearch" },
			spec: {
				selector: { app: "meilisearch" },
				clusterIP: "None",
				ports: [{ port: 7700 }],
			},
		},
		baseOpts,
	);

	const imagePullSecrets = [{ name: "ghcr-pull-secret" }];
	const redisEnv: EnvVar[] = [
		fromSecret(STORE_SECRET, "REDIS_PASSWORD"),
		{ name: "REDIS_URL", value: "redis://:$(REDIS_PASSWORD)@redis:6379" },
	];

	// ─── Application services ────────────────────────────────────────────────────
	// Each gets the catalog's variables for it, then the values the stack
	// derives from in-cluster names and the domain (app-env.ts, `derived`).

	// API
	new k8s.apps.v1.Deployment(
		"api",
		{
			metadata: { namespace: ns, name: "api" },
			spec: {
				replicas: cfg.autoscaling.api.min,
				selector: { matchLabels: { app: "api" } },
				template: {
					metadata: { labels: { app: "api" }, annotations: podAnnotations },
					spec: {
						imagePullSecrets,
						containers: [
							{
								name: "api",
								image: `${reg}/api:${tag}`,
								// `dev` and `latest` move: a restart must fetch the new build.
								imagePullPolicy: "Always",
								ports: [{ containerPort: 3000 }],
								env: [
									...passThroughEnv("api"),
									fromSecret(STORE_SECRET, "MONGO_PASSWORD"),
									{
										name: "DATABASE_URI",
										value: `mongodb://${cfg.mongoUser}:$(MONGO_PASSWORD)@mongodb:27017/${cfg.mongoDb}?authSource=admin&replicaSet=rs0`,
									},
									...redisEnv,
									{ name: "MEILI_HOST", value: "http://meilisearch:7700" },
									{
										name: "PAYLOAD_PUBLIC_SERVER_URL",
										value: `https://api.${domain}`,
									},
									{ name: "PAYLOAD_ALLOWED_ORIGINS", value: webOrigins },
									{ name: "CHAT_PUBLIC_URL", value: `https://chat.${domain}` },
									{ name: "PUBLIC_WEB_URL", value: `https://${domain}` },
								],
								// The API has no /api/health: /api/public/config is the route
								// every client calls first, served once Payload is up.
								// A first boot (indexes, migrations) gets five minutes.
								startupProbe: {
									httpGet: { path: "/api/public/config", port: 3000 },
									periodSeconds: 10,
									failureThreshold: 30,
								},
								readinessProbe: {
									httpGet: { path: "/api/public/config", port: 3000 },
									periodSeconds: 10,
									timeoutSeconds: 5,
								},
								resources: {
									requests: { memory: "256Mi", cpu: "100m" },
									limits: { memory: "1Gi" },
								},
							},
						],
					},
				},
			},
		},
		// The autoscaler owns the replica count from here on.
		{ provider, dependsOn: appDeps, ignoreChanges: ["spec.replicas"] },
	);

	new k8s.core.v1.Service(
		"api-svc",
		{
			metadata: { namespace: ns, name: "api" },
			spec: {
				selector: { app: "api" },
				ports: [{ port: 3000, targetPort: 3000 }],
			},
		},
		baseOpts,
	);

	// Web
	new k8s.apps.v1.Deployment(
		"web",
		{
			metadata: { namespace: ns, name: "web" },
			spec: {
				replicas: cfg.autoscaling.web.min,
				selector: { matchLabels: { app: "web" } },
				template: {
					metadata: { labels: { app: "web" }, annotations: podAnnotations },
					spec: {
						imagePullSecrets,
						containers: [
							{
								name: "web",
								image: `${reg}/web:${tag}`,
								// `dev` and `latest` move: a restart must fetch the new build.
								imagePullPolicy: "Always",
								ports: [{ containerPort: 3001 }],
								env: [
									...passThroughEnv("web"),
									{
										name: "NEXT_PUBLIC_API_URL",
										value: `https://api.${domain}`,
									},
									{ name: "NEXT_PUBLIC_WEB_URL", value: `https://${domain}` },
									// Server-side rendering calls the API in the cluster, not
									// through the public DNS, the ingress and TLS.
									{ name: "API_INTERNAL_URL", value: "http://api:3000" },
									{ name: "CHAT_PUBLIC_URL", value: `https://chat.${domain}` },
								],
								resources: {
									requests: { memory: "256Mi", cpu: "100m" },
									limits: { memory: "1Gi" },
								},
							},
						],
					},
				},
			},
		},
		{ provider, dependsOn: appDeps, ignoreChanges: ["spec.replicas"] },
	);

	new k8s.core.v1.Service(
		"web-svc",
		{
			metadata: { namespace: ns, name: "web" },
			spec: {
				selector: { app: "web" },
				ports: [{ port: 3001, targetPort: 3001 }],
			},
		},
		baseOpts,
	);

	// ─── Autoscaling ─────────────────────────────────────────────────────────────
	// K3s ships metrics-server. CPU is measured against each pod's request
	// (api 100m, web 100m), so a busy pod is one using more than 70m.
	for (const name of ["api", "web"] as const) {
		const range = cfg.autoscaling[name];
		new k8s.autoscaling.v2.HorizontalPodAutoscaler(
			`${name}-hpa`,
			{
				metadata: { namespace: ns, name },
				spec: {
					scaleTargetRef: { apiVersion: "apps/v1", kind: "Deployment", name },
					minReplicas: range.min,
					maxReplicas: range.max,
					metrics: [
						{
							type: "Resource",
							resource: {
								name: "cpu",
								target: { type: "Utilization", averageUtilization: 70 },
							},
						},
					],
					behavior: {
						// Up within a minute; down only after five calm minutes.
						scaleUp: { stabilizationWindowSeconds: 30 },
						scaleDown: { stabilizationWindowSeconds: 300 },
					},
				},
			},
			baseOpts,
		);
	}

	// Chat service
	new k8s.apps.v1.Deployment(
		"chat-service",
		{
			metadata: { namespace: ns, name: "chat-service" },
			spec: {
				replicas: 1,
				selector: { matchLabels: { app: "chat-service" } },
				template: {
					metadata: {
						labels: { app: "chat-service" },
						annotations: podAnnotations,
					},
					spec: {
						imagePullSecrets,
						containers: [
							{
								name: "chat-service",
								image: `${reg}/chat-service:${tag}`,
								// `dev` and `latest` move: a restart must fetch the new build.
								imagePullPolicy: "Always",
								ports: [{ containerPort: 4000 }],
								env: [
									...passThroughEnv("chat"),
									...redisEnv,
									{ name: "PAYLOAD_API_URL", value: "http://api:3000/api" },
									{ name: "CORS_ORIGIN", value: webOrigins },
									{ name: "PORT", value: "4000" },
								],
								resources: {
									requests: { memory: "128Mi", cpu: "50m" },
									limits: { memory: "256Mi" },
								},
							},
						],
					},
				},
			},
		},
		{ provider, dependsOn: appDeps },
	);

	new k8s.core.v1.Service(
		"chat-service-svc",
		{
			metadata: { namespace: ns, name: "chat-service" },
			spec: {
				selector: { app: "chat-service" },
				ports: [{ port: 4000, targetPort: 4000 }],
			},
		},
		baseOpts,
	);

	// Search indexer (no external service needed)
	new k8s.apps.v1.Deployment(
		"search-indexer",
		{
			metadata: { namespace: ns, name: "search-indexer" },
			spec: {
				replicas: 1,
				selector: { matchLabels: { app: "search-indexer" } },
				template: {
					metadata: {
						labels: { app: "search-indexer" },
						annotations: podAnnotations,
					},
					spec: {
						imagePullSecrets,
						containers: [
							{
								name: "search-indexer",
								image: `${reg}/search-indexer:${tag}`,
								// `dev` and `latest` move: a restart must fetch the new build.
								imagePullPolicy: "Always",
								env: [
									...passThroughEnv("indexer"),
									...redisEnv,
									{ name: "MEILI_HOST", value: "http://meilisearch:7700" },
									{ name: "PAYLOAD_API_URL", value: "http://api:3000/api" },
								],
								resources: {
									requests: { memory: "128Mi", cpu: "50m" },
									limits: { memory: "256Mi" },
								},
							},
						],
					},
				},
			},
		},
		{ provider, dependsOn: appDeps },
	);
}
