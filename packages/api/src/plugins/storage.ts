import type { Plugin } from "payload";

type StorageProvider = "s3" | "azure" | "local";

interface StorageEnv {
	STORAGE_PROVIDER?: string;
	S3_BUCKET?: string;
	S3_PRIVATE_BUCKET?: string;
	AZURE_STORAGE_CONTAINER_NAME?: string;
	AZURE_STORAGE_PRIVATE_CONTAINER_NAME?: string;
	NODE_ENV?: string;
}

function getProvider(env: StorageEnv = process.env): StorageProvider {
	const val = env.STORAGE_PROVIDER?.toLowerCase();
	if (val === "s3") return "s3";
	if (val === "azure") return "azure";
	return "local";
}

// Collections that use file storage in the public bucket/container.
const storageCollections = { media: true } as const;

/** Identity documents live under their own prefix in their own private container. */
const PRIVATE_PREFIX = "verification";

/**
 * Checked at config build time, on the environment alone.
 *
 * Deliberately NOT conditioned on `AppSettings.verification.enabled`: the
 * config is built before the database is reachable, so a check that read the
 * flag would either block startup on a database round trip or silently pass.
 * The rule this enforces is the one that matters either way — if this
 * deployment stores files at all, identity documents are not in the bucket the
 * CDN serves.
 */
export function assertPrivateStorageConfig(
	env: StorageEnv = process.env,
): string | null {
	const provider = getProvider(env);

	if (provider === "local") {
		return env.NODE_ENV === "production"
			? "STORAGE_PROVIDER=local stores identity documents on the container filesystem; refused in production. Set STORAGE_PROVIDER to s3 or azure."
			: null;
	}

	if (provider === "s3") {
		const priv = env.S3_PRIVATE_BUCKET?.trim() ?? "";
		if (!priv) {
			return "S3_PRIVATE_BUCKET is empty; identity documents have nowhere private to go.";
		}
		if (priv === (env.S3_BUCKET?.trim() ?? "")) {
			return "S3_PRIVATE_BUCKET is the same bucket as S3_BUCKET; identity documents would be served publicly.";
		}
		return null;
	}

	const container = env.AZURE_STORAGE_PRIVATE_CONTAINER_NAME?.trim() ?? "";
	if (!container) {
		return "AZURE_STORAGE_PRIVATE_CONTAINER_NAME is empty; identity documents have nowhere private to go.";
	}
	if (container === (env.AZURE_STORAGE_CONTAINER_NAME?.trim() ?? "")) {
		return "AZURE_STORAGE_PRIVATE_CONTAINER_NAME is the same container as AZURE_STORAGE_CONTAINER_NAME.";
	}
	return null;
}

export async function buildStoragePlugins(): Promise<Plugin[]> {
	const provider = getProvider();
	const refusal = assertPrivateStorageConfig();
	if (refusal) throw new Error(`[storage] ${refusal}`);

	if (provider === "s3") {
		const { s3Storage } = await import("@payloadcms/storage-s3");
		const config = {
			credentials: {
				accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
				secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
			},
			region: process.env.S3_REGION ?? "us-east-1",
			...(process.env.S3_ENDPOINT && {
				endpoint: process.env.S3_ENDPOINT,
				forcePathStyle: true,
			}),
		};
		return [
			s3Storage({
				collections: storageCollections,
				bucket: process.env.S3_BUCKET ?? "",
				config,
			}),
			s3Storage({
				collections: { "verification-documents": { prefix: PRIVATE_PREFIX } },
				bucket: process.env.S3_PRIVATE_BUCKET ?? "",
				acl: "private",
				// Identity documents are never uploaded from the browser (the
				// collection's access control has no open `create`), so the
				// plugin's direct-to-bucket client upload path is disabled here
				// rather than left to its default.
				clientUploads: false,
				config,
			}),
		];
	}

	if (provider === "azure") {
		const { azureStorage } = await import("@payloadcms/storage-azure");
		const base = {
			baseURL: process.env.AZURE_STORAGE_ACCOUNT_BASEURL ?? "",
			connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING ?? "",
			allowContainerCreate:
				process.env.AZURE_STORAGE_ALLOW_CONTAINER_CREATE === "true",
		};
		return [
			azureStorage({
				...base,
				collections: storageCollections,
				containerName: process.env.AZURE_STORAGE_CONTAINER_NAME ?? "",
			}),
			azureStorage({
				...base,
				collections: {
					"verification-documents": { prefix: PRIVATE_PREFIX },
				},
				containerName: process.env.AZURE_STORAGE_PRIVATE_CONTAINER_NAME ?? "",
			}),
		];
	}

	// local: Payload stores both collections natively, each in its own staticDir.
	return [];
}
