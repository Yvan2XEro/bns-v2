import type * as pulumi from "@pulumi/pulumi";
import { getStack } from "@pulumi/pulumi";
import { createEksCluster } from "./aws";
import { createAksCluster } from "./azure";
import * as config from "./config";
import { deployKubernetes } from "./kubernetes";
import { createProxmoxCluster } from "./proxmox-k3s";

interface Cluster {
	kubeconfig: pulumi.Output<unknown> | pulumi.Output<string>;
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

deployKubernetes(cluster.kubeconfig);

export const clusterName = cluster.clusterName;
