import * as k8s from "@pulumi/kubernetes";
import type * as pulumi from "@pulumi/pulumi";
import * as config from "../config";
import { deployApps } from "./apps";
import { deployNginxStack } from "./nginx";

export function deployKubernetes(kubeconfig: pulumi.Output<string>): void {
	const provider = new k8s.Provider("k8s-provider", { kubeconfig });

	deployApps({
		provider,
		imageRegistry: config.imageRegistry,
		imageTag: config.imageTag,
		domain: config.domain,
		ghcrToken: config.ghcrToken,
		appEnv: config.appEnv,
		appSecrets: config.appSecrets,
		mongoUser: config.mongoUser,
		mongoDb: config.mongoDb,
		meiliEnv: config.meiliEnv,
		mongoPassword: config.mongoPassword,
		redisPassword: config.redisPassword,
		meiliMasterKey: config.meiliMasterKey,
		autoscaling: config.autoscaling,
	});

	deployNginxStack({
		provider,
		domain: config.domain,
		acmeEmail: config.acmeEmail,
		tlsIssuer: config.tlsIssuer,
	});
}
