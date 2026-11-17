import type * as pulumi from "@pulumi/pulumi";
import { getStack } from "@pulumi/pulumi";
import { createAtlasDatabase } from "./atlas";
import { createEksCluster } from "./aws";
import { createAksCluster } from "./azure";
import * as config from "./config";
import { deployKubernetes } from "./kubernetes";
import { createProxmoxCluster } from "./proxmox-k3s";

interface Cluster {
	kubeconfig: pulumi.Output<unknown>;
	clusterName: pulumi.Output<string>;
	/** Where pods' outbound traffic comes from, for databases that allow-list it. */
	egressIps?: pulumi.Output<string>[];
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

function createAtlas() {
	if (!config.atlas) return null;
	const egressIps = cluster.egressIps ?? [];
	if (egressIps.length === 0 && config.atlas.accessCidrs.length === 0)
		throw new Error(
			"database: atlas needs the cluster's egress IPs (AKS) or atlas.accessCidrs",
		);
	return createAtlasDatabase(
		name,
		config.atlas,
		{
			username: config.mongoUser,
			password: config.mongoPassword,
			database: config.mongoDb,
		},
		egressIps,
	);
}
const atlas = createAtlas();

// EKS hands back the kubeconfig as an object, AKS and K3s as YAML text.
deployKubernetes(
	cluster.kubeconfig.apply((value: unknown) =>
		typeof value === "string" ? value : JSON.stringify(value),
	),
	atlas ? { kind: "external", uri: atlas.uri } : { kind: "in-cluster" },
);

export const clusterName = cluster.clusterName;
export const egressIps = cluster.egressIps;
export const atlasCluster = atlas?.clusterName;
/** `pulumi stack output --show-secrets databaseUri`: for the restore runbook only. */
export const databaseUri = atlas?.uri;
