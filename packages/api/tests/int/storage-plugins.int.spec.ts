import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const azureStorage = vi.fn((config: Record<string, unknown>) => ({
	__provider: "azure",
	config,
}));
const s3Storage = vi.fn((config: Record<string, unknown>) => ({
	__provider: "s3",
	config,
}));

vi.mock("@payloadcms/storage-azure", () => ({ azureStorage }));
vi.mock("@payloadcms/storage-s3", () => ({ s3Storage }));

const STORAGE_ENV_KEYS = [
	"STORAGE_PROVIDER",
	"NODE_ENV",
	"S3_BUCKET",
	"S3_PRIVATE_BUCKET",
	"S3_ACCESS_KEY_ID",
	"S3_SECRET_ACCESS_KEY",
	"S3_REGION",
	"S3_ENDPOINT",
	"AZURE_STORAGE_CONTAINER_NAME",
	"AZURE_STORAGE_PRIVATE_CONTAINER_NAME",
	"AZURE_STORAGE_ALLOW_CONTAINER_CREATE",
	"AZURE_STORAGE_ACCOUNT_BASEURL",
	"AZURE_STORAGE_CONNECTION_STRING",
	"PRIVATE_UPLOADS_DIR",
] as const;

describe("buildStoragePlugins", () => {
	let saved: Record<string, string | undefined>;

	beforeEach(() => {
		saved = Object.fromEntries(
			STORAGE_ENV_KEYS.map((key) => [key, process.env[key]]),
		);
		for (const key of STORAGE_ENV_KEYS) delete process.env[key];
		azureStorage.mockClear();
		s3Storage.mockClear();
	});

	afterEach(() => {
		for (const key of STORAGE_ENV_KEYS) {
			const value = saved[key];
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	it("boots STORAGE_PROVIDER=local under NODE_ENV=production with no plugins", async () => {
		process.env.STORAGE_PROVIDER = "local";
		process.env.NODE_ENV = "production";

		const { buildStoragePlugins } = await import("../../src/plugins/storage");
		await expect(buildStoragePlugins()).resolves.toEqual([]);
	});

	it("still refuses S3 in production when the private bucket is missing", async () => {
		process.env.STORAGE_PROVIDER = "s3";
		process.env.NODE_ENV = "production";
		process.env.S3_BUCKET = "bns-media";

		const { buildStoragePlugins } = await import("../../src/plugins/storage");
		await expect(buildStoragePlugins()).rejects.toThrow(/S3_PRIVATE_BUCKET/);
	});
});
