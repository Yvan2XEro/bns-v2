import * as k8s from "@pulumi/kubernetes";
import type * as pulumi from "@pulumi/pulumi";
import type { ObservabilityConfig } from "../config";

/**
 * The Overbrand agent: grafana/k8s-monitoring with the values of
 * github.com/overbrand/observability (agents/alloy-k8s/values.yaml). Keep the
 * two in step. Everything it sends is labelled project=bns and env, and
 * `service` is the container (metrics) or the pod's `app` label (logs), so the
 * shared dashboards and alerts cover BNS without a BNS-specific rule.
 */
export function deployObservability(
	provider: k8s.Provider,
	cfg: ObservabilityConfig,
): pulumi.Resource {
	const ns = new k8s.core.v1.Namespace(
		"monitoring-ns",
		{ metadata: { name: "monitoring" } },
		{ provider },
	);

	const auth = {
		type: "basic",
		username: cfg.username,
		password: cfg.password,
	};
	const extraLabels = { project: "bns", env: cfg.env };
	const serviceFromContainer = `rule {
  source_labels = ["container"]
  regex         = "(.+)"
  target_label  = "service"
}`;

	return new k8s.helm.v3.Release(
		"overbrand-agent",
		{
			chart: "k8s-monitoring",
			repositoryOpts: { repo: "https://grafana.github.io/helm-charts" },
			version: "4.6.1",
			namespace: "monitoring",
			// Image pulls on a home connection can outlast Helm's 5 minutes.
			timeout: 900,
			values: {
				cluster: { name: cfg.clusterName },
				destinations: {
					"overbrand-metrics": {
						type: "prometheus",
						url: `https://${cfg.ingestDomain}/api/v1/write`,
						auth,
						extraLabels,
					},
					"overbrand-logs": {
						type: "loki",
						url: `https://${cfg.ingestDomain}/loki/api/v1/push`,
						auth,
						extraLabels,
					},
				},
				collectors: {
					"alloy-metrics": { presets: ["clustered", "statefulset"] },
					"alloy-logs": { presets: ["filesystem-log-reader", "daemonset"] },
					"alloy-singleton": { presets: ["singleton"] },
				},
				telemetryServices: {
					"kube-state-metrics": { deploy: true },
					"node-exporter": { deploy: true },
				},
				clusterMetrics: {
					enabled: true,
					collector: "alloy-metrics",
					cadvisor: { extraMetricProcessingRules: serviceFromContainer },
					"kube-state-metrics": {
						extraMetricProcessingRules: serviceFromContainer,
					},
				},
				hostMetrics: {
					enabled: true,
					collector: "alloy-metrics",
					linuxHosts: {
						enabled: true,
						metricsTuning: {
							includeMetrics: ["node_load1", "node_uname_info"],
						},
						extraMetricProcessingRules: `rule {
  source_labels = ["instance"]
  target_label  = "host"
}`,
					},
				},
				clusterEvents: { enabled: true, collector: "alloy-singleton" },
				podLogsViaLoki: {
					enabled: true,
					collector: "alloy-logs",
					labels: {
						service: "app",
						app_kubernetes_io_name: "app.kubernetes.io/name",
					},
					extraDiscoveryRules: `rule {
  source_labels = ["__meta_kubernetes_pod_label_app_kubernetes_io_name"]
  regex         = "(.+)"
  target_label  = "service"
}
rule {
  source_labels = ["__meta_kubernetes_pod_label_app"]
  regex         = "(.+)"
  target_label  = "service"
}
rule {
  source_labels = ["service", "__meta_kubernetes_pod_container_name"]
  regex         = ";(.+)"
  target_label  = "service"
}`,
				},
			},
		},
		{ provider, dependsOn: [ns] },
	);
}
