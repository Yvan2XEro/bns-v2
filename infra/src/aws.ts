import * as eks from "@pulumi/eks";
import type * as pulumi from "@pulumi/pulumi";

export interface EksResult {
	kubeconfig: pulumi.Output<any>;
	clusterName: pulumi.Output<string>;
}

export function createEksCluster(
	name: string,
	nodeCount: number,
	instanceType: string,
): EksResult {
	const cluster = new eks.Cluster(name, {
		desiredCapacity: nodeCount,
		minSize: 1,
		maxSize: nodeCount * 2,
		instanceType,
		enabledClusterLogTypes: ["api", "audit"],
		tags: { Project: "bns", ManagedBy: "pulumi" },
	});

	return {
		kubeconfig: cluster.kubeconfig,
		clusterName: cluster.eksCluster.name,
	};
}
