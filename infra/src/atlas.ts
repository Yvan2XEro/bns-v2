import * as mongodbatlas from "@pulumi/mongodbatlas";
import * as pulumi from "@pulumi/pulumi";
import type { AtlasConfig } from "./config";

export interface AtlasDatabase {
	/** `mongodb+srv://…` with the app user's credentials: a secret. */
	uri: pulumi.Output<string>;
	clusterName: pulumi.Output<string>;
	projectId: pulumi.Output<string>;
}

/**
 * The production database on MongoDB Atlas: a three-node replica set (what
 * Payload's transactions need), continuous cloud backup with point-in-time
 * restore, one least-privilege user for the API, and network access from
 * the cluster's egress IPs only. The cluster is protected twice: Atlas's
 * termination protection and Pulumi's `protect`, so neither a `pulumi
 * destroy` nor a renamed resource can drop the data.
 */
export function createAtlasDatabase(
	name: string,
	cfg: AtlasConfig,
	user: { username: string; password: pulumi.Output<string>; database: string },
	/** One entry per egress IP; the count is fixed by the cluster's design. */
	egressIps: pulumi.Input<string>[],
): AtlasDatabase {
	const project = new mongodbatlas.Project(`${name}-atlas-project`, {
		name: cfg.projectName,
		orgId: cfg.orgId,
	});

	const cluster = new mongodbatlas.AdvancedCluster(
		`${name}-atlas`,
		{
			projectId: project.id,
			name: cfg.clusterName,
			clusterType: "REPLICASET",
			mongoDbMajorVersion: cfg.mongoVersion,
			backupEnabled: true,
			pitEnabled: true,
			terminationProtectionEnabled: true,
			replicationSpecs: [
				{
					regionConfigs: [
						{
							providerName: cfg.providerName,
							regionName: cfg.regionName,
							priority: 7,
							electableSpecs: { instanceSize: cfg.instanceSize, nodeCount: 3 },
							autoScaling: { diskGbEnabled: true },
						},
					],
				},
			],
		},
		{ protect: true },
	);

	// Snapshots every 6 h kept 2 days, dailies 14 days, weeklies 8 weeks,
	// monthlies 12 months; point-in-time restore anywhere in the last
	// `restoreWindowDays` on top of them.
	new mongodbatlas.CloudBackupSchedule(`${name}-atlas-backups`, {
		projectId: project.id,
		clusterName: cluster.name,
		referenceHourOfDay: 2,
		referenceMinuteOfHour: 0,
		restoreWindowDays: cfg.restoreWindowDays,
		policyItemHourly: {
			frequencyInterval: 6,
			retentionUnit: "days",
			retentionValue: 2,
		},
		policyItemDaily: {
			frequencyInterval: 1,
			retentionUnit: "days",
			retentionValue: 14,
		},
		policyItemWeeklies: [
			{ frequencyInterval: 7, retentionUnit: "weeks", retentionValue: 8 },
		],
		policyItemMonthlies: [
			{ frequencyInterval: 40, retentionUnit: "months", retentionValue: 12 },
		],
	});

	// readWrite covers what the API does: documents, indexes, transactions.
	new mongodbatlas.DatabaseUser(`${name}-atlas-user`, {
		projectId: project.id,
		authDatabaseName: "admin",
		username: user.username,
		password: user.password,
		roles: [{ roleName: "readWrite", databaseName: user.database }],
		scopes: [{ name: cluster.name, type: "CLUSTER" }],
	});

	for (const [i, ip] of egressIps.entries()) {
		new mongodbatlas.ProjectIpAccessList(`${name}-atlas-egress-${i}`, {
			projectId: project.id,
			ipAddress: ip,
			comment: "Kubernetes cluster egress",
		});
	}
	for (const [i, cidr] of cfg.accessCidrs.entries()) {
		new mongodbatlas.ProjectIpAccessList(`${name}-atlas-operator-${i}`, {
			projectId: project.id,
			cidrBlock: cidr.includes("/") ? cidr : `${cidr}/32`,
			comment: "Operator access (atlas.accessCidrs); remove when done",
		});
	}

	const host = cluster.connectionStrings.apply((strings) => {
		const srv = strings[0]?.standardSrv;
		if (!srv) throw new Error("Atlas returned no SRV connection string");
		return srv.replace(/^mongodb\+srv:\/\//, "");
	});
	const uri = pulumi.secret(
		pulumi
			.all([host, user.password])
			.apply(
				([h, password]) =>
					`mongodb+srv://${encodeURIComponent(user.username)}:${encodeURIComponent(password)}@${h}/${user.database}?retryWrites=true&w=majority&authSource=admin`,
			),
	);

	return { uri, clusterName: cluster.name, projectId: project.id };
}
