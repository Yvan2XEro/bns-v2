import type * as pulumi from "@pulumi/pulumi";
import { getStack } from "@pulumi/pulumi";
import { createAtlasDatabase } from "./atlas";
import { createEksCluster } from "./aws";
import { createAksCluster } from "./azure";
import { createBackupStorage } from "./azure-backup";
import * as config from "./config";
import { deployKubernetes } from "./kubernetes";
import { createProxmoxCluster } from "./proxmox-k3s";

interface Cluster {
	kubeconfig: pulumi.Output<unknown>;
	clusterName: pulumi.Output<string>;
	/** Where pods' outbound traffic comes from, for databases that allow-list it. */
	egressIps?: pulumi.Output<string>[];
	/** Azure only: the resource group the backup storage joins. */
	resourceGroupName?: pulumi.Output<string>;
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

function createMongoBackups() {
	if (!config.mongoBackup) return null;
	if (!cluster.resourceGroupName)
		throw new Error("mongoBackup needs the AKS resource group");
	return {
		...createBackupStorage(
			name,
			cluster.resourceGroupName,
			config.region,
			config.mongoBackup,
		),
		schedule: config.mongoBackup.schedule,
		diskSku: config.mongoBackup.diskSku,
	};
}
const backups = createMongoBackups();

// EKS hands back the kubeconfig as an object, AKS and K3s as YAML text.
deployKubernetes(
	cluster.kubeconfig.apply((value: unknown) =>
		typeof value === "string" ? value : JSON.stringify(value),
	),
	atlas
		? { kind: "external", uri: atlas.uri }
		: {
				kind: "in-cluster",
				...(backups
					? {
							backup: {
								schedule: backups.schedule,
								diskSku: backups.diskSku,
								container: backups.container,
								connectionString: backups.connectionString,
							},
						}
					: {}),
			},
);

export const clusterName = cluster.clusterName;
/** Azure: where `az aks get-credentials` finds the cluster (CI deploys). */
export const resourceGroupName = cluster.resourceGroupName;
/** The release running now: `make infra-up` refuses a stale local imageTag. */
export const imageTag = config.imageTag;
export const egressIps = cluster.egressIps;
export const atlasCluster = atlas?.clusterName;
/** `pulumi stack output --show-secrets databaseUri`: for the restore runbook only. */
export const databaseUri = atlas?.uri;
/** The storage account holding the nightly MongoDB dumps (`mongoBackup`). */
export const backupStorageAccount = backups?.accountName;
