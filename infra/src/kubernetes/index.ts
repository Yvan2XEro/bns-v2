import * as k8s from "@pulumi/kubernetes";
import type * as pulumi from "@pulumi/pulumi";
import * as config from "../config";
import { deployApps } from "./apps";
import { deployNginxStack } from "./nginx";

export function deployKubernetes(
	kubeconfig: pulumi.Output<any> | pulumi.Output<string>,
): void {
	const provider = new k8s.Provider("k8s-provider", { kubeconfig });

	deployApps({
		provider,
		imageRegistry: config.imageRegistry,
		imageTag: config.imageTag,
		domain: config.domain,
		ghcrToken: config.ghcrToken,
		mongoPassword: config.mongoPassword,
		redisPassword: config.redisPassword,
		meiliMasterKey: config.meiliMasterKey,
		payloadSecret: config.payloadSecret,
		chatServicePassword: config.chatServicePassword,
		googleClientId: config.googleClientId,
		googleClientSecret: config.googleClientSecret,
		novuSecretKey: config.novuSecretKey,
		novuAppIdentifier: config.novuAppIdentifier,
		stripeSecretKey: config.stripeSecretKey,
		stripePublishableKey: config.stripePublishableKey,
		stripeWebhookSecret: config.stripeWebhookSecret,
		notchpayPublicKey: config.notchpayPublicKey,
		notchpayHashKey: config.notchpayHashKey,
	});

	deployNginxStack({
		provider,
		domain: config.domain,
		acmeEmail: config.acmeEmail,
	});
}
