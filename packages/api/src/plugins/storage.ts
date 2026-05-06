import type { Plugin } from "payload";

type StorageProvider = "s3" | "azure" | "local";

function getProvider(): StorageProvider {
	const val = process.env.STORAGE_PROVIDER?.toLowerCase();
	if (val === "s3") return "s3";
	if (val === "azure") return "azure";
	return "local";
}

// Collections that use file storage
const storageCollections = {
	media: true,
} as const;

export async function buildStoragePlugin(): Promise<Plugin | null> {
	const provider = getProvider();

	if (provider === "s3") {
		const { s3Storage } = await import("@payloadcms/storage-s3");
		return s3Storage({
			collections: storageCollections,
			bucket: process.env.S3_BUCKET ?? "",
			config: {
				credentials: {
					accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
					secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
				},
				region: process.env.S3_REGION ?? "us-east-1",
				...(process.env.S3_ENDPOINT && {
					endpoint: process.env.S3_ENDPOINT,
					forcePathStyle: true,
				}),
			},
		});
	}

	if (provider === "azure") {
		const { azureStorage } = await import("@payloadcms/storage-azure");
		return azureStorage({
			collections: storageCollections,
			baseURL: process.env.AZURE_STORAGE_ACCOUNT_BASEURL ?? "",
			connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING ?? "",
			containerName: process.env.AZURE_STORAGE_CONTAINER_NAME ?? "",
			allowContainerCreate:
				process.env.AZURE_STORAGE_ALLOW_CONTAINER_CREATE === "true",
		});
	}

	// local: no plugin needed, Payload handles storage natively
	return null;
}
