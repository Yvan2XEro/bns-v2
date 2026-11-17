import * as pulumi from "@pulumi/pulumi";
import { APP_ENV_CONFIG_KEY, APP_SECRETS_CONFIG_KEY } from "./app-env";
import { asEnvStrings } from "./env-plan";

const cfg = new pulumi.Config();

export const CLOUD_PROVIDERS = ["aws", "azure", "proxmox"] as const;
export type CloudProvider = (typeof CLOUD_PROVIDERS)[number];

const provider = cfg.require("cloudProvider");
if (!(CLOUD_PROVIDERS as readonly string[]).includes(provider))
	throw new Error(
		`Unsupported cloudProvider "${provider}". Supported: ${CLOUD_PROVIDERS.join(", ")}`,
	);
export const cloudProvider = provider as CloudProvider;
// Azure only: AWS reads `aws:region`, Proxmox has none.
export const region =
	cloudProvider === "azure" ? cfg.require("region") : (cfg.get("region") ?? "");
export const nodeCount = cfg.getNumber("nodeCount") ?? 2;

// AWS: an EC2 instance type. Proxmox: a profile from `PROXMOX_SIZES`
// (small, medium, large).
export const instanceType =
	cfg.get("instanceType") ??
	(cloudProvider === "proxmox" ? "medium" : "t3.medium");

// Azure-specific
export const vmSize = cfg.get("vmSize") ?? "Standard_B2s";

// App
export const imageRegistry =
	cfg.get("imageRegistry") ?? "ghcr.io/yvan2xero/bns-v2";
export const imageTag = cfg.get("imageTag") ?? "latest";

// Pods added under load (CPU above 70% of what each pod requests) and
// removed when it falls. `pulumi config set --path autoscaling.api.max 8`.
export interface ReplicaRange {
	min: number;
	max: number;
}
const scaling =
	cfg.getObject<Partial<Record<"api" | "web", Partial<ReplicaRange>>>>(
		"autoscaling",
	) ?? {};
function replicaRange(
	name: "api" | "web",
	defaults: ReplicaRange,
): ReplicaRange {
	const range = { ...defaults, ...scaling[name] };
	if (range.min < 1 || range.max < range.min)
		throw new Error(`autoscaling.${name}: need 1 <= min <= max`);
	return range;
}
export const autoscaling = {
	api: replicaRange("api", { min: 2, max: 6 }),
	web: replicaRange("web", { min: 2, max: 4 }),
};
export const domain = cfg.require("domain");
// How the ingress gets its certificate. `letsencrypt` needs a public domain
// reachable on port 80; `local-ca` signs with a CA the cluster creates, for a
// private domain (a .lan served by Pi-hole) — trust that CA on your devices.
export const TLS_ISSUERS = ["letsencrypt", "local-ca"] as const;
export type TlsIssuer = (typeof TLS_ISSUERS)[number];
const issuer = cfg.get("tlsIssuer") ?? "letsencrypt";
if (!(TLS_ISSUERS as readonly string[]).includes(issuer))
	throw new Error(
		`Unsupported tlsIssuer "${issuer}". Supported: ${TLS_ISSUERS.join(", ")}`,
	);
export const tlsIssuer = issuer as TlsIssuer;
export const acmeEmail =
	tlsIssuer === "letsencrypt"
		? cfg.require("acmeEmail")
		: (cfg.get("acmeEmail") ?? "");

// The production `.env`, written by `scripts/env-to-stack.ts`: plain values
// in `appEnv`, secrets in `appSecrets` (see app-env.ts for every name).
export const appEnv = asEnvStrings(
	cfg.getObject<Record<string, unknown>>(APP_ENV_CONFIG_KEY),
);
export const appSecrets: pulumi.Output<Record<string, string>> = (
	cfg.getSecret(APP_SECRETS_CONFIG_KEY) ?? pulumi.secret("{}")
).apply((json) => asEnvStrings(JSON.parse(json) as Record<string, unknown>));

/** One required secret out of `appSecrets`, failing the deployment when absent. */
function requiredSecret(name: string): pulumi.Output<string> {
	return appSecrets.apply((secrets) => {
		const value = secrets[name];
		if (!value)
			throw new Error(
				`appSecrets.${name} is missing: run scripts/env-to-stack.ts with the production .env`,
			);
		return value;
	});
}

export const mongoUser = appEnv.MONGO_USER || "bns";
export const mongoDb = appEnv.MONGO_DB || "bns";
export const meiliEnv = appEnv.MEILI_ENV || "production";
export const mongoPassword = requiredSecret("MONGO_PASSWORD");
export const redisPassword = requiredSecret("REDIS_PASSWORD");
export const meiliMasterKey = requiredSecret("MEILI_MASTER_KEY");

// Pulls the images; not an app variable.
export const ghcrToken = cfg.requireSecret("ghcrToken");

// ─── Database ────────────────────────────────────────────────────────────────
// `in-cluster`: a single-node replica set in a StatefulSet (staging, labs).
// `atlas`: MongoDB Atlas, provisioned by this stack (src/atlas.ts), with
// continuous backups and point-in-time restore — the production choice.
// Atlas credentials come from MONGODB_ATLAS_PUBLIC_KEY / _PRIVATE_KEY in the
// shell (or `pulumi config set --secret mongodbatlas:privateKey`), never from
// the app `.env`.
export const DATABASES = ["in-cluster", "atlas"] as const;
export type Database = (typeof DATABASES)[number];
const database = cfg.get("database") ?? "in-cluster";
if (!(DATABASES as readonly string[]).includes(database))
	throw new Error(
		`Unsupported database "${database}". Supported: ${DATABASES.join(", ")}`,
	);
export const databaseKind = database as Database;

/** Azure regions Atlas names differently; anything else needs `atlas.region`. */
const ATLAS_AZURE_REGIONS: Record<string, string> = {
	westeurope: "EUROPE_WEST",
	northeurope: "EUROPE_NORTH",
	francecentral: "FRANCE_CENTRAL",
	germanywestcentral: "GERMANY_WEST_CENTRAL",
	uksouth: "UK_SOUTH",
	southafricanorth: "SOUTH_AFRICA_NORTH",
	eastus: "US_EAST",
	eastus2: "US_EAST_2",
};

export interface AtlasConfig {
	orgId: string;
	projectName: string;
	clusterName: string;
	/** Atlas's provider for the cluster: the same cloud as the app keeps latency low. */
	providerName: "AZURE" | "AWS";
	regionName: string;
	/** M10 is the smallest tier with continuous backup and point-in-time restore. */
	instanceSize: string;
	mongoVersion: string;
	/** Days a point-in-time restore can reach back to. */
	restoreWindowDays: number;
	/** Extra CIDRs allowed in, e.g. an operator's IP for the first restore. Remove after. */
	accessCidrs: string[];
}

function atlasConfig(): AtlasConfig | null {
	if (databaseKind !== "atlas") return null;
	const raw = cfg.requireObject<Partial<AtlasConfig>>("atlas");
	if (!raw.orgId)
		throw new Error("atlas.orgId is required with database: atlas");
	const providerName =
		raw.providerName ?? (cloudProvider === "aws" ? "AWS" : "AZURE");
	const regionName =
		raw.regionName ??
		(cloudProvider === "azure" ? ATLAS_AZURE_REGIONS[region] : undefined);
	if (!regionName)
		throw new Error(
			`atlas.regionName is required: no Atlas name known for region "${region}"`,
		);
	return {
		orgId: raw.orgId,
		projectName: raw.projectName ?? `bns-${pulumi.getStack()}`,
		clusterName: raw.clusterName ?? "bns",
		providerName,
		regionName,
		instanceSize: raw.instanceSize ?? "M10",
		mongoVersion: raw.mongoVersion ?? "7.0",
		restoreWindowDays: raw.restoreWindowDays ?? 7,
		accessCidrs: raw.accessCidrs ?? [],
	};
}
export const atlas = atlasConfig();

/**
 * While true the API is not deployed, so nothing writes to the database:
 * the window for the first restore (docs/runbook-aks-production.md).
 * Everything else, the database included, is created.
 */
export const apiPaused = cfg.getBoolean("apiPaused") ?? false;
