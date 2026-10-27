/**
 * Every environment variable the production `.env` (Dokploy today) can carry,
 * and what the Kubernetes stack does with it. One catalog for both sides:
 * `scripts/env-to-stack.ts` refuses a `.env` with a name missing here, and
 * `kubernetes/apps.ts` injects each value into exactly the services listed —
 * so moving from Dokploy never drops a variable silently.
 *
 *   app      — passed through as is, to the listed services
 *   derived  — built by the stack from in-cluster names and the domain; a
 *              value in the `.env` (Dokploy's hosts) is ignored on purpose
 *   infra    — read by the stack itself, not by a service
 *   dokploy  — only meaningful to the Compose deployment; ignored
 */
export type AppService = "api" | "web" | "chat" | "indexer";

export type EnvEntry =
	| {
			kind: "app";
			secret: boolean;
			services: readonly AppService[];
			required?: boolean;
	  }
	| { kind: "derived"; note: string }
	| { kind: "infra"; secret: boolean; required?: boolean; note: string }
	| { kind: "dokploy" };

const api = (secret = false, required = false): EnvEntry => ({
	kind: "app",
	secret,
	services: ["api"],
	required,
});
const derived = (note: string): EnvEntry => ({ kind: "derived", note });
const dokploy: EnvEntry = { kind: "dokploy" };

export const APP_ENV = {
	// ── Data stores (credentials shared by the store and its clients) ──
	MONGO_USER: {
		kind: "infra",
		secret: false,
		note: "MongoDB root user (default bns)",
	},
	MONGO_PASSWORD: {
		kind: "infra",
		secret: true,
		required: true,
		note: "MongoDB root password",
	},
	MONGO_DB: {
		kind: "infra",
		secret: false,
		note: "database name (default bns)",
	},
	REDIS_PASSWORD: {
		kind: "infra",
		secret: true,
		required: true,
		note: "Redis password",
	},
	MEILI_MASTER_KEY: {
		kind: "app",
		secret: true,
		services: ["api", "indexer"],
		required: true,
	},
	MEILI_ENV: {
		kind: "infra",
		secret: false,
		note: "Meilisearch mode (default production)",
	},

	// ── Hosts: the stack serves web, www., api. and chat. of one domain ──
	WEB_DOMAIN: {
		kind: "infra",
		secret: false,
		required: true,
		note: "→ domain",
	},
	WEB_WWW_DOMAIN: {
		kind: "infra",
		secret: false,
		note: "must be www.<domain>",
	},
	API_DOMAIN: { kind: "infra", secret: false, note: "must be api.<domain>" },
	CHAT_DOMAIN: { kind: "infra", secret: false, note: "must be chat.<domain>" },
	DB_DOMAIN: dokploy,
	SEARCH_DOMAIN: dokploy,

	// ── Built by the stack from the domain and in-cluster service names ──
	DATABASE_URI: derived("mongodb://…@mongodb:27017"),
	MONGODB_URI: derived("same as DATABASE_URI"),
	REDIS_URL: derived("redis://…@redis:6379"),
	MEILI_HOST: derived("http://meilisearch:7700"),
	MEILISEARCH_HOST: derived("legacy name of MEILI_HOST"),
	MEILISEARCH_API_KEY: derived("legacy name of MEILI_MASTER_KEY"),
	PAYLOAD_PUBLIC_SERVER_URL: derived("https://api.<domain>"),
	PAYLOAD_ALLOWED_ORIGINS: derived("https://<domain>,https://www.<domain>"),
	PAYLOAD_API_URL: derived("http://api:3000/api"),
	CORS_ORIGIN: derived("https://<domain>,https://www.<domain>"),
	CHAT_PUBLIC_URL: derived("https://chat.<domain>"),
	PUBLIC_WEB_URL: derived("https://<domain>"),
	NEXT_PUBLIC_WEB_URL: derived("https://<domain>"),
	NEXT_PUBLIC_API_URL: derived("https://api.<domain>"),
	API_INTERNAL_URL: derived("http://api:3000, for the web app's server side"),
	PORT: derived("each service's own port"),
	NODE_ENV: derived("set by the images"),

	// ── Core ──
	PAYLOAD_SECRET: api(true, true),
	RISK_HASH_SECRET: api(true),
	ORDER_PHONE_PEPPER: api(true),
	VERIFICATION_HASH_PEPPER: api(true),
	VERIFICATION_ALLOW_UNAUTHORISED: api(),
	TRUSTED_PROXY_COUNT: api(),
	LOG_LEVEL: api(),
	PLATFORM_LEGAL_NAME: api(),
	SUPPORT_EMAIL: api(),
	SUPPORT_PHONE: api(),
	PHOTON_URL: api(),

	// ── Chat service account ──
	CHAT_SERVICE_EMAIL: { kind: "app", secret: false, services: ["api", "chat"] },
	CHAT_SERVICE_PASSWORD: {
		kind: "app",
		secret: true,
		services: ["chat"],
		required: true,
	},

	// ── Sign-in providers ──
	GOOGLE_OAUTH_CLIENT_ID: api(),
	GOOGLE_OAUTH_CLIENT_SECRET: api(true),
	APPLE_OAUTH_CLIENT_ID: api(),
	APPLE_OAUTH_TEAM_ID: api(),
	APPLE_OAUTH_KEY_ID: api(),
	APPLE_OAUTH_PRIVATE_KEY: api(true),
	APPLE_NATIVE_CLIENT_ID: api(),
	FACEBOOK_OAUTH_APP_ID: api(),
	FACEBOOK_OAUTH_APP_SECRET: api(true),
	// Overbrand's single sign-on to the Payload panel; every OIDC_* but the
	// client has a default (packages/api/src/auth/sso/config.ts).
	OIDC_CLIENT_ID: api(),
	OIDC_CLIENT_SECRET: api(true),
	OIDC_ISSUER: api(),
	OIDC_AUTHORIZATION_ENDPOINT: api(),
	OIDC_TOKEN_ENDPOINT: api(),
	OIDC_USERINFO_ENDPOINT: api(),
	OIDC_JWKS_URI: api(),
	OIDC_REQUIRED_ROLE: api(),
	OIDC_SCOPES: api(),
	OIDC_LABEL: api(),

	// ── Payments and delivery ──
	PAYMENTS_PROVIDER: api(),
	PROTECTED_PAYMENT_ALLOWED: api(),
	NOTCHPAY_PUBLIC_KEY: api(),
	NOTCHPAY_PRIVATE_KEY: api(true),
	NOTCHPAY_HASH_KEY: api(true),
	NOTCHPAY_BASE_URL: api(),
	NOTCHPAY_WEBHOOK_INBOX: api(),
	STRIPE_PUBLISHABLE_KEY: api(),
	STRIPE_SECRET_KEY: api(true),
	STRIPE_WEBHOOK_SECRET: api(true),
	COURIER_PROVIDER: api(),
	YANGO_DELIVERY_BASE_URL: api(),
	YANGO_DELIVERY_API_KEY: api(true),
	YANGO_DELIVERY_WEBHOOK_SECRET: api(true),

	// ── Email (verification, password reset): Resend or SMTP ──
	EMAIL_PROVIDER: api(),
	RESEND_API_KEY: api(true),
	SMTP_HOST: api(),
	SMTP_PORT: api(),
	SMTP_USER: api(),
	SMTP_PASS: api(true),
	EMAIL_FROM_ADDRESS: api(),
	EMAIL_FROM_NAME: api(),

	// ── App links: shared links open the native app (web/src/app/well-known) ──
	APPLE_TEAM_ID: { kind: "app", secret: false, services: ["web"] },
	ANDROID_SHA256_CERT_FINGERPRINTS: {
		kind: "app",
		secret: false,
		services: ["web"],
	},

	// ── Notifications ──
	NOVU_SECRET_KEY: api(true),
	NOVU_APPLICATION_IDENTIFIER: {
		kind: "app",
		secret: false,
		services: ["api", "web"],
	},
	// Novu Cloud by default; a self-hosted instance's API and WebSocket. The
	// web hands them to its inbox; the API to the app (/api/public/config).
	NOVU_API_URL: { kind: "app", secret: false, services: ["api", "web"] },
	NOVU_SOCKET_URL: { kind: "app", secret: false, services: ["api", "web"] },
	NOVU_EXPO_INTEGRATION_IDENTIFIER: api(),

	// ── Monitoring (distributed to the apps by /api/public/config) ──
	SENTRY_DSN: api(),
	SENTRY_WEB_DSN: api(),
	SENTRY_MOBILE_DSN: api(),
	SENTRY_ENVIRONMENT: api(),
	SENTRY_TRACES_SAMPLE_RATE: api(),
	POSTHOG_PROJECT_KEY: api(),
	POSTHOG_HOST: api(),

	// ── Storage ──
	STORAGE_PROVIDER: api(),
	S3_BUCKET: api(),
	S3_PRIVATE_BUCKET: api(),
	S3_REGION: api(),
	S3_ENDPOINT: api(),
	S3_ACCESS_KEY_ID: api(true),
	S3_SECRET_ACCESS_KEY: api(true),
	AZURE_STORAGE_CONNECTION_STRING: api(true),
	AZURE_STORAGE_ACCOUNT_BASEURL: api(),
	AZURE_STORAGE_CONTAINER_NAME: api(),
	AZURE_STORAGE_PRIVATE_CONTAINER_NAME: api(),
	AZURE_STORAGE_ALLOW_CONTAINER_CREATE: api(),
	PRIVATE_UPLOADS_DIR: api(),

	// ── Identity verification ──
	DIDIT_API_KEY: api(true),
	DIDIT_WEBHOOK_SECRET: api(true),
	DIDIT_WORKFLOW_ID: api(),
	DIDIT_BASE_URL: api(),

	// ── Stack only ──
	GHCR_TOKEN: {
		kind: "infra",
		secret: true,
		note: "pulls the images from GHCR (→ ghcrToken)",
	},
	IMAGE_REGISTRY: {
		kind: "infra",
		secret: false,
		note: "where the images live (→ imageRegistry)",
	},
	IMAGE_TAG: { kind: "infra", secret: false, note: "image tag (→ imageTag)" },
	ACME_EMAIL: {
		kind: "infra",
		secret: false,
		note: "Let's Encrypt account (→ acmeEmail)",
	},

	// ── Compose only ──
	MONGO_IMAGE: dokploy,
	MONGO_EXPRESS_USER: dokploy,
	MONGO_EXPRESS_PASSWORD: dokploy,
	GITHUB_REPO: dokploy,
	DEBUG_DB_URI: dokploy,
} as const satisfies Record<string, EnvEntry>;

export type AppEnvName = keyof typeof APP_ENV;

export function isKnownEnv(name: string): name is AppEnvName {
	return Object.hasOwn(APP_ENV, name);
}

/** Stack config keys holding the `.env` values, plain and secret. */
export const APP_ENV_CONFIG_KEY = "appEnv";
export const APP_SECRETS_CONFIG_KEY = "appSecrets";

/** The pass-through names a service receives, in catalog order. */
export function appEnvFor(
	service: AppService,
): { name: AppEnvName; secret: boolean }[] {
	const names: { name: AppEnvName; secret: boolean }[] = [];
	for (const [name, entry] of Object.entries(APP_ENV) as [
		AppEnvName,
		EnvEntry,
	][]) {
		if (entry.kind === "app" && entry.services.includes(service))
			names.push({ name, secret: entry.secret });
	}
	return names;
}

/** Whether a name's value belongs in the secret map (`app` or `infra`). */
export function isSecretEnv(name: AppEnvName): boolean {
	const entry: EnvEntry = APP_ENV[name];
	return (entry.kind === "app" || entry.kind === "infra") && entry.secret;
}
