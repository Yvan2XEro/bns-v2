import * as azure from "@pulumi/azure-native";
import type * as pulumi from "@pulumi/pulumi";

export interface AksResult {
	kubeconfig: pulumi.Output<string>;
	clusterName: pulumi.Output<string>;
}

export function createAksCluster(
	name: string,
	location: string,
	nodeCount: number,
	vmSize: string,
): AksResult {
	const rg = new azure.resources.ResourceGroup(`${name}-rg`, {
		location,
		tags: { Project: "bns", ManagedBy: "pulumi" },
	});

	const cluster = new azure.containerservice.ManagedCluster(name, {
		resourceGroupName: rg.name,
		location,
		agentPoolProfiles: [
			{
				name: "system",
				count: nodeCount,
				vmSize,
				mode: "System",
				osDiskSizeGB: 50,
				type: "VirtualMachineScaleSets",
				enableAutoScaling: true,
				minCount: 1,
				maxCount: nodeCount * 2,
			},
		],
		identity: { type: "SystemAssigned" },
		dnsPrefix: name,
		enableRBAC: true,
		networkProfile: {
			networkPlugin: "azure",
			loadBalancerSku: "standard",
		},
		tags: { Project: "bns", ManagedBy: "pulumi" },
	});

	const creds = azure.containerservice.listManagedClusterUserCredentialsOutput({
		resourceGroupName: rg.name,
		resourceName: cluster.name,
	});

	const kubeconfig = creds.kubeconfigs[0].value.apply((v) =>
		Buffer.from(v, "base64").toString(),
	);

	return { kubeconfig, clusterName: cluster.name };
}
