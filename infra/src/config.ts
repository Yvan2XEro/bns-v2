import * as pulumi from "@pulumi/pulumi";
import { APP_ENV_CONFIG_KEY, APP_SECRETS_CONFIG_KEY } from "./app-env";

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
export const domain = cfg.require("domain");
export const acmeEmail = cfg.require("acmeEmail");

// The production `.env`, written by `scripts/env-to-stack.ts`: plain values
// in `appEnv`, secrets in `appSecrets` (see app-env.ts for every name).
export const appEnv =
	cfg.getObject<Record<string, string>>(APP_ENV_CONFIG_KEY) ?? {};
export const appSecrets: pulumi.Output<Record<string, string>> =
	cfg.getSecretObject<Record<string, string>>(APP_SECRETS_CONFIG_KEY) ??
	pulumi.secret<Record<string, string>>({});

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
