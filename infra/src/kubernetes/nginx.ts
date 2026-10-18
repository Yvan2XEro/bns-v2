import * as k8s from "@pulumi/kubernetes";
import type * as pulumi from "@pulumi/pulumi";
import type { TlsIssuer } from "../config";

interface NginxConfig {
	domain: string;
	acmeEmail: string;
	tlsIssuer: TlsIssuer;
	provider: k8s.Provider;
}

/** Name of the local CA's issuer, and of the secret holding its certificate. */
export const LOCAL_CA = "bns-local-ca";

export function deployNginxStack(cfg: NginxConfig): pulumi.Resource[] {
	const { provider, domain, acmeEmail, tlsIssuer } = cfg;

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
			// Image pulls on a home connection can outlast Helm's 5 minutes.
			timeout: 900,
			values: { installCRDs: true },
		},
		{ provider, dependsOn: [certManagerNs] },
	);

	const clusterIssuer =
		tlsIssuer === "letsencrypt"
			? letsEncryptIssuer(provider, acmeEmail, certManager)
			: localCaIssuer(provider, certManager);
	const issuerName =
		tlsIssuer === "letsencrypt" ? "letsencrypt-prod" : LOCAL_CA;

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
			// Image pulls on a home connection can outlast Helm's 5 minutes.
			timeout: 900,
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
					"cert-manager.io/cluster-issuer": issuerName,
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

/** Let's Encrypt, validated over HTTP: the domain must be public. */
function letsEncryptIssuer(
	provider: k8s.Provider,
	acmeEmail: string,
	certManager: pulumi.Resource,
): k8s.apiextensions.CustomResource {
	return new k8s.apiextensions.CustomResource(
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
}

/**
 * A CA the cluster creates for itself (ten years), then signs the ingress
 * certificate with. For a private domain: export its certificate once and
 * trust it on each device —
 *   kubectl -n cert-manager get secret bns-local-ca -o jsonpath='{.data.ca\.crt}' | base64 -d > bns-local-ca.crt
 */
function localCaIssuer(
	provider: k8s.Provider,
	certManager: pulumi.Resource,
): k8s.apiextensions.CustomResource {
	const selfSigned = new k8s.apiextensions.CustomResource(
		"bns-selfsigned",
		{
			apiVersion: "cert-manager.io/v1",
			kind: "ClusterIssuer",
			metadata: { name: "bns-selfsigned" },
			spec: { selfSigned: {} },
		},
		{ provider, dependsOn: [certManager] },
	);
	// A ClusterIssuer reads its CA secret from cert-manager's own namespace.
	const caCertificate = new k8s.apiextensions.CustomResource(
		"bns-local-ca-certificate",
		{
			apiVersion: "cert-manager.io/v1",
			kind: "Certificate",
			metadata: { name: LOCAL_CA, namespace: "cert-manager" },
			spec: {
				isCA: true,
				commonName: "BuyNSellem local CA",
				secretName: LOCAL_CA,
				duration: "87600h",
				privateKey: { algorithm: "ECDSA", size: 256 },
				issuerRef: {
					name: "bns-selfsigned",
					kind: "ClusterIssuer",
					group: "cert-manager.io",
				},
			},
		},
		{ provider, dependsOn: [selfSigned] },
	);
	return new k8s.apiextensions.CustomResource(
		LOCAL_CA,
		{
			apiVersion: "cert-manager.io/v1",
			kind: "ClusterIssuer",
			metadata: { name: LOCAL_CA },
			spec: { ca: { secretName: LOCAL_CA } },
		},
		{ provider, dependsOn: [caCertificate] },
	);
}
