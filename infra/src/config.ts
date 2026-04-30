import * as pulumi from "@pulumi/pulumi";

const cfg = new pulumi.Config();

export type CloudProvider = "aws" | "azure";

export const cloudProvider = cfg.require("cloudProvider") as CloudProvider;
export const region = cfg.require("region");
export const nodeCount = cfg.getNumber("nodeCount") ?? 2;

// AWS-specific
export const instanceType = cfg.get("instanceType") ?? "t3.medium";

// Azure-specific
export const vmSize = cfg.get("vmSize") ?? "Standard_B2s";

// App
export const imageRegistry =
	cfg.get("imageRegistry") ?? "ghcr.io/yvan2xero/bns-v2";
export const imageTag = cfg.get("imageTag") ?? "latest";
export const domain = cfg.require("domain");
export const acmeEmail = cfg.require("acmeEmail");

// Secrets — set with: pulumi config set --secret <key> <value>
export const ghcrToken = cfg.requireSecret("ghcrToken");
export const mongoPassword = cfg.requireSecret("mongoPassword");
export const redisPassword = cfg.requireSecret("redisPassword");
export const meiliMasterKey = cfg.requireSecret("meiliMasterKey");
export const payloadSecret = cfg.requireSecret("payloadSecret");
export const chatServicePassword = cfg.requireSecret("chatServicePassword");

// Optional integrations
export const googleClientId = cfg.get("googleClientId") ?? "";
export const googleClientSecret =
	cfg.getSecret("googleClientSecret") ?? pulumi.secret("");
export const novuSecretKey =
	cfg.getSecret("novuSecretKey") ?? pulumi.secret("");
export const novuAppIdentifier = cfg.get("novuAppIdentifier") ?? "";
export const stripeSecretKey =
	cfg.getSecret("stripeSecretKey") ?? pulumi.secret("");
export const stripePublishableKey = cfg.get("stripePublishableKey") ?? "";
export const stripeWebhookSecret =
	cfg.getSecret("stripeWebhookSecret") ?? pulumi.secret("");
export const notchpayPublicKey = cfg.get("notchpayPublicKey") ?? "";
export const notchpayHashKey =
	cfg.getSecret("notchpayHashKey") ?? pulumi.secret("");
