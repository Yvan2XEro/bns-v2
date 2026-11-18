import * as azure from "@pulumi/azure-native";
import * as pulumi from "@pulumi/pulumi";
import type { MongoBackupConfig } from "./config";

export interface BackupStorage {
	accountName: pulumi.Output<string>;
	container: string;
	/** Account connection string, for the backup CronJob only: a secret. */
	connectionString: pulumi.Output<string>;
}

const CONTAINER = "mongo-backups";

/**
 * Where the nightly MongoDB dumps land: a storage account of its own (not the
 * media one), private, TLS 1.2, geo-redundant by default. Deleted blobs and
 * containers stay recoverable for 14 days (soft delete), so a wrong `az
 * storage blob delete` or a compromised key cannot erase the history at
 * once. A lifecycle rule moves dumps to cool storage after 7 days and deletes
 * them after `retentionDays`. Protected from `pulumi destroy`.
 */
export function createBackupStorage(
	name: string,
	resourceGroupName: pulumi.Input<string>,
	location: string,
	cfg: MongoBackupConfig,
): BackupStorage {
	// 3–24 lowercase letters and digits, globally unique: a fixed prefix and
	// a random suffix Pulumi keeps for the account's life.
	const account = new azure.storage.StorageAccount(
		`${name}-backups`,
		{
			resourceGroupName,
			location,
			kind: "StorageV2",
			sku: { name: cfg.sku },
			accessTier: "Hot",
			allowBlobPublicAccess: false,
			allowSharedKeyAccess: true,
			minimumTlsVersion: "TLS1_2",
			enableHttpsTrafficOnly: true,
			tags: { Project: "bns", ManagedBy: "pulumi", Purpose: "mongo-backups" },
		},
		{ protect: true },
	);

	new azure.storage.BlobServiceProperties(`${name}-backups-blob-service`, {
		resourceGroupName,
		accountName: account.name,
		blobServicesName: "default",
		deleteRetentionPolicy: { enabled: true, days: 14 },
		containerDeleteRetentionPolicy: { enabled: true, days: 14 },
	});

	new azure.storage.BlobContainer(`${name}-backups-container`, {
		resourceGroupName,
		accountName: account.name,
		containerName: CONTAINER,
		publicAccess: "None",
	});

	new azure.storage.ManagementPolicy(`${name}-backups-lifecycle`, {
		resourceGroupName,
		accountName: account.name,
		managementPolicyName: "default",
		policy: {
			rules: [
				{
					name: "mongo-backup-retention",
					enabled: true,
					type: "Lifecycle",
					definition: {
						filters: {
							blobTypes: ["blockBlob"],
							prefixMatch: [`${CONTAINER}/`],
						},
						actions: {
							baseBlob: {
								tierToCool: {
									daysAfterModificationGreaterThan: Math.min(
										7,
										Math.max(cfg.retentionDays - 1, 0),
									),
								},
								delete: { daysAfterModificationGreaterThan: cfg.retentionDays },
							},
						},
					},
				},
			],
		},
	});

	const keys = azure.storage.listStorageAccountKeysOutput({
		resourceGroupName,
		accountName: account.name,
	});
	const connectionString = pulumi.secret(
		pulumi
			.all([account.name, keys.keys])
			.apply(
				([accountName, list]) =>
					`DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${list[0]?.value ?? ""};EndpointSuffix=core.windows.net`,
			),
	);

	return { accountName: account.name, container: CONTAINER, connectionString };
}
