import * as pulumi from "@pulumi/pulumi";
import { createEksCluster } from "./aws";
import { createAksCluster } from "./azure";
import * as config from "./config";
import { deployKubernetes } from "./kubernetes";

let kubeconfig: pulumi.Output<any> | pulumi.Output<string>;
let clusterName: pulumi.Output<string>;

if (config.cloudProvider === "aws") {
	const eks = createEksCluster(
		`bns-${pulumi.getStack()}`,
		config.nodeCount,
		config.instanceType,
	);
	kubeconfig = eks.kubeconfig;
	clusterName = eks.clusterName;
} else {
	const aks = createAksCluster(
		`bns-${pulumi.getStack()}`,
		config.region,
		config.nodeCount,
		config.vmSize,
	);
	kubeconfig = aks.kubeconfig;
	clusterName = aks.clusterName;
}

deployKubernetes(kubeconfig);

export { clusterName };
