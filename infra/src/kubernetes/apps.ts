import * as k8s from "@pulumi/kubernetes";
import type * as pulumi from "@pulumi/pulumi";

export interface AppsConfig {
	imageRegistry: string;
	imageTag: string;
	domain: string;
	ghcrToken: pulumi.Output<string>;
	mongoPassword: pulumi.Output<string>;
	redisPassword: pulumi.Output<string>;
	meiliMasterKey: pulumi.Output<string>;
	payloadSecret: pulumi.Output<string>;
	chatServicePassword: pulumi.Output<string>;
	googleClientId: string;
	googleClientSecret: pulumi.Output<string>;
	novuSecretKey: pulumi.Output<string>;
	novuAppIdentifier: string;
	stripeSecretKey: pulumi.Output<string>;
	stripePublishableKey: string;
	stripeWebhookSecret: pulumi.Output<string>;
	notchpayPublicKey: string;
	notchpayHashKey: pulumi.Output<string>;
	provider: k8s.Provider;
}

function secretRef(
	name: string,
	key: string,
): k8s.types.input.core.v1.EnvVarArgs {
	return { name: key, valueFrom: { secretKeyRef: { name, key } } };
}

function _stsVolume(claimName: string): k8s.types.input.core.v1.VolumeArgs {
	return { name: "data", persistentVolumeClaim: { claimName } };
}

export function deployApps(cfg: AppsConfig): void {
	const { provider, imageRegistry: reg, imageTag: tag, domain } = cfg;
	const ns = "bns";

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

	// App secrets
	new k8s.core.v1.Secret(
		"bns-secrets",
		{
			metadata: { namespace: ns, name: "bns-secrets" },
			stringData: {
				MONGO_PASSWORD: cfg.mongoPassword,
				REDIS_PASSWORD: cfg.redisPassword,
				MEILI_MASTER_KEY: cfg.meiliMasterKey,
				PAYLOAD_SECRET: cfg.payloadSecret,
				CHAT_SERVICE_PASSWORD: cfg.chatServicePassword,
				GOOGLE_CLIENT_SECRET: cfg.googleClientSecret,
				NOVU_SECRET_KEY: cfg.novuSecretKey,
				STRIPE_SECRET_KEY: cfg.stripeSecretKey,
				STRIPE_WEBHOOK_SECRET: cfg.stripeWebhookSecret,
				NOTCHPAY_HASH_KEY: cfg.notchpayHashKey,
			},
		},
		baseOpts,
	);

	// ─── Infrastructure ──────────────────────────────────────────────────────────

	// MongoDB
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
								env: [
									{ name: "MONGO_INITDB_ROOT_USERNAME", value: "bns" },
									secretRef("bns-secrets", "MONGO_PASSWORD"),
									{ name: "MONGO_INITDB_DATABASE", value: "bns" },
								],
								volumeMounts: [{ name: "data", mountPath: "/data/db" }],
								resources: {
									requests: { memory: "256Mi", cpu: "100m" },
									limits: { memory: "512Mi" },
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
							resources: { requests: { storage: "10Gi" } },
						},
					},
				],
			},
		},
		baseOpts,
	);

	new k8s.core.v1.Service(
		"mongodb-svc",
		{
			metadata: { namespace: ns, name: "mongodb" },
			spec: {
				selector: { app: "mongodb" },
				clusterIP: "None",
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
								env: [secretRef("bns-secrets", "REDIS_PASSWORD")],
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
		baseOpts,
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
									secretRef("bns-secrets", "MEILI_MASTER_KEY"),
									{ name: "MEILI_ENV", value: "production" },
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
		baseOpts,
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

	// ─── Application services ────────────────────────────────────────────────────

	// API
	new k8s.apps.v1.Deployment(
		"api",
		{
			metadata: { namespace: ns, name: "api" },
			spec: {
				replicas: 2,
				selector: { matchLabels: { app: "api" } },
				template: {
					metadata: { labels: { app: "api" } },
					spec: {
						imagePullSecrets,
						containers: [
							{
								name: "api",
								image: `${reg}/api:${tag}`,
								ports: [{ containerPort: 3000 }],
								env: [
									secretRef("bns-secrets", "MONGO_PASSWORD"),
									{
										name: "DATABASE_URI",
										value:
											"mongodb://bns:$(MONGO_PASSWORD)@mongodb:27017/bns?authSource=admin",
									},
									secretRef("bns-secrets", "PAYLOAD_SECRET"),
									{
										name: "PAYLOAD_PUBLIC_SERVER_URL",
										value: `https://api.${domain}`,
									},
									{
										name: "PAYLOAD_ALLOWED_ORIGINS",
										value: `https://${domain},https://www.${domain}`,
									},
									secretRef("bns-secrets", "REDIS_PASSWORD"),
									{
										name: "REDIS_URL",
										value: "redis://:$(REDIS_PASSWORD)@redis:6379",
									},
									{ name: "MEILI_HOST", value: "http://meilisearch:7700" },
									secretRef("bns-secrets", "MEILI_MASTER_KEY"),
									{ name: "GOOGLE_OAUTH_CLIENT_ID", value: cfg.googleClientId },
									secretRef("bns-secrets", "GOOGLE_CLIENT_SECRET"),
									{
										name: "NOVU_APPLICATION_IDENTIFIER",
										value: cfg.novuAppIdentifier,
									},
									{ name: "NOVU_API_URL", value: "https://api.novu.co" },
									secretRef("bns-secrets", "NOVU_SECRET_KEY"),
									{
										name: "STRIPE_PUBLISHABLE_KEY",
										value: cfg.stripePublishableKey,
									},
									secretRef("bns-secrets", "STRIPE_SECRET_KEY"),
									secretRef("bns-secrets", "STRIPE_WEBHOOK_SECRET"),
									{ name: "NOTCHPAY_PUBLIC_KEY", value: cfg.notchpayPublicKey },
									{
										name: "NOTCHPAY_BASE_URL",
										value: "https://api.notchpay.co",
									},
									secretRef("bns-secrets", "NOTCHPAY_HASH_KEY"),
									{ name: "CHAT_PUBLIC_URL", value: `https://chat.${domain}` },
									{ name: "PUBLIC_WEB_URL", value: `https://${domain}` },
								],
								readinessProbe: {
									httpGet: { path: "/api/health", port: 3000 },
									initialDelaySeconds: 15,
									periodSeconds: 10,
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
		{ provider, dependsOn: [namespace, pullSecret] },
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
				replicas: 2,
				selector: { matchLabels: { app: "web" } },
				template: {
					metadata: { labels: { app: "web" } },
					spec: {
						imagePullSecrets,
						containers: [
							{
								name: "web",
								image: `${reg}/web:${tag}`,
								ports: [{ containerPort: 3001 }],
								env: [
									{
										name: "NEXT_PUBLIC_API_URL",
										value: `https://api.${domain}`,
									},
									{ name: "CHAT_PUBLIC_URL", value: `https://chat.${domain}` },
									{
										name: "NOVU_APPLICATION_IDENTIFIER",
										value: cfg.novuAppIdentifier,
									},
								],
								resources: {
									requests: { memory: "256Mi", cpu: "100m" },
									limits: { memory: "512Mi" },
								},
							},
						],
					},
				},
			},
		},
		{ provider, dependsOn: [namespace, pullSecret] },
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

	// Chat service
	new k8s.apps.v1.Deployment(
		"chat-service",
		{
			metadata: { namespace: ns, name: "chat-service" },
			spec: {
				replicas: 1,
				selector: { matchLabels: { app: "chat-service" } },
				template: {
					metadata: { labels: { app: "chat-service" } },
					spec: {
						imagePullSecrets,
						containers: [
							{
								name: "chat-service",
								image: `${reg}/chat-service:${tag}`,
								ports: [{ containerPort: 4000 }],
								env: [
									secretRef("bns-secrets", "REDIS_PASSWORD"),
									{
										name: "REDIS_URL",
										value: "redis://:$(REDIS_PASSWORD)@redis:6379",
									},
									{ name: "PAYLOAD_API_URL", value: "http://api:3000/api" },
									{
										name: "CORS_ORIGIN",
										value: `https://${domain},https://www.${domain}`,
									},
									{ name: "CHAT_SERVICE_EMAIL", value: "chat@buynsellem.com" },
									secretRef("bns-secrets", "CHAT_SERVICE_PASSWORD"),
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
		{ provider, dependsOn: [namespace, pullSecret] },
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
					metadata: { labels: { app: "search-indexer" } },
					spec: {
						imagePullSecrets,
						containers: [
							{
								name: "search-indexer",
								image: `${reg}/search-indexer:${tag}`,
								env: [
									secretRef("bns-secrets", "REDIS_PASSWORD"),
									{
										name: "REDIS_URL",
										value: "redis://:$(REDIS_PASSWORD)@redis:6379",
									},
									{
										name: "MEILISEARCH_HOST",
										value: "http://meilisearch:7700",
									},
									secretRef("bns-secrets", "MEILI_MASTER_KEY"),
									{ name: "MEILISEARCH_API_KEY", value: "$(MEILI_MASTER_KEY)" },
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
		{ provider, dependsOn: [namespace, pullSecret] },
	);
}
