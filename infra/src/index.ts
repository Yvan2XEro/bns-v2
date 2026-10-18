import type * as pulumi from "@pulumi/pulumi";
import { getStack } from "@pulumi/pulumi";
import { createEksCluster } from "./aws";
import { createAksCluster } from "./azure";
import * as config from "./config";
import { deployKubernetes } from "./kubernetes";
import { createProxmoxCluster } from "./proxmox-k3s";

interface Cluster {
	kubeconfig: pulumi.Output<unknown>;
	clusterName: pulumi.Output<string>;
}

const name = `bns-${getStack()}`;

function createCluster(): Cluster {
	switch (config.cloudProvider) {
		case "aws":
			return createEksCluster(name, config.nodeCount, config.instanceType);
		case "azure":
			return createAksCluster(
				name,
				config.region,
				config.nodeCount,
				config.vmSize,
			);
		case "proxmox":
			return createProxmoxCluster(name, config.nodeCount, config.instanceType);
	}
}

const cluster = createCluster();

// EKS hands back the kubeconfig as an object, AKS and K3s as YAML text.
deployKubernetes(
	cluster.kubeconfig.apply((value: unknown) =>
		typeof value === "string" ? value : JSON.stringify(value),
	),
);

export const clusterName = cluster.clusterName;
