import * as k8s from "@pulumi/kubernetes";
import type * as pulumi from "@pulumi/pulumi";

interface NginxConfig {
	domain: string;
	acmeEmail: string;
	provider: k8s.Provider;
}

export function deployNginxStack(cfg: NginxConfig): pulumi.Resource[] {
	const { provider, domain, acmeEmail } = cfg;

	// cert-manager
	const certManagerNs = new k8s.core.v1.Namespace(
		"cert-manager-ns",
		{ metadata: { name: "cert-manager" } },
		{ provider },
	);

	const certManager = new k8s.helm.v3.Release(
		"cert-manager",
		{
			chart: "cert-manager",
			repositoryOpts: { repo: "https://charts.jetstack.io" },
			namespace: "cert-manager",
			version: "v1.15.0",
			values: { installCRDs: true },
		},
		{ provider, dependsOn: [certManagerNs] },
	);

	// ClusterIssuer — Let's Encrypt production
	const clusterIssuer = new k8s.apiextensions.CustomResource(
		"letsencrypt-prod",
		{
			apiVersion: "cert-manager.io/v1",
			kind: "ClusterIssuer",
			metadata: { name: "letsencrypt-prod" },
			spec: {
				acme: {
					server: "https://acme-v02.api.letsencrypt.org/directory",
					email: acmeEmail,
					privateKeySecretRef: { name: "letsencrypt-prod-key" },
					solvers: [{ http01: { ingress: { ingressClassName: "nginx" } } }],
				},
			},
		},
		{ provider, dependsOn: [certManager] },
	);

	// ingress-nginx
	const nginxNs = new k8s.core.v1.Namespace(
		"ingress-nginx-ns",
		{ metadata: { name: "ingress-nginx" } },
		{ provider },
	);

	const nginxIngress = new k8s.helm.v3.Release(
		"ingress-nginx",
		{
			chart: "ingress-nginx",
			repositoryOpts: { repo: "https://kubernetes.github.io/ingress-nginx" },
			namespace: "ingress-nginx",
			version: "4.10.0",
			values: {
				controller: {
					replicaCount: 2,
					service: { type: "LoadBalancer" },
					metrics: { enabled: false },
				},
			},
		},
		{ provider, dependsOn: [nginxNs] },
	);

	// Ingress for all BNS services
	const ingress = new k8s.networking.v1.Ingress(
		"bns-ingress",
		{
			metadata: {
				namespace: "bns",
				name: "bns-ingress",
				annotations: {
					"kubernetes.io/ingress.class": "nginx",
					"cert-manager.io/cluster-issuer": "letsencrypt-prod",
					"nginx.ingress.kubernetes.io/proxy-body-size": "50m",
				},
			},
			spec: {
				ingressClassName: "nginx",
				tls: [
					{
						hosts: [domain, `www.${domain}`, `api.${domain}`, `chat.${domain}`],
						secretName: "bns-tls",
					},
				],
				rules: [
					{
						host: `api.${domain}`,
						http: {
							paths: [
								{
									path: "/",
									pathType: "Prefix",
									backend: { service: { name: "api", port: { number: 3000 } } },
								},
							],
						},
					},
					{
						host: domain,
						http: {
							paths: [
								{
									path: "/",
									pathType: "Prefix",
									backend: { service: { name: "web", port: { number: 3001 } } },
								},
							],
						},
					},
					{
						host: `www.${domain}`,
						http: {
							paths: [
								{
									path: "/",
									pathType: "Prefix",
									backend: { service: { name: "web", port: { number: 3001 } } },
								},
							],
						},
					},
					{
						host: `chat.${domain}`,
						http: {
							paths: [
								{
									path: "/",
									pathType: "Prefix",
									backend: {
										service: { name: "chat-service", port: { number: 4000 } },
									},
								},
							],
						},
					},
				],
			},
		},
		{ provider, dependsOn: [nginxIngress, clusterIssuer] },
	);

	return [certManager, nginxIngress, clusterIssuer, ingress];
}
