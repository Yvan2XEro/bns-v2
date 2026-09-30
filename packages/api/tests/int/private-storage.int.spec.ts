import { describe, expect, it } from "vitest";
import {
	signLocalFileToken,
	verifyLocalFileToken,
} from "../../src/lib/privateFiles";
import { assertPrivateStorageConfig } from "../../src/plugins/storage";

describe("assertPrivateStorageConfig", () => {
	it("passes for S3 with a distinct private bucket", () => {
		expect(
			assertPrivateStorageConfig({
				STORAGE_PROVIDER: "s3",
				S3_BUCKET: "bns-media",
				S3_PRIVATE_BUCKET: "bns-private",
			}),
		).toBeNull();
	});

	it("refuses an empty private bucket", () => {
		expect(
			assertPrivateStorageConfig({
				STORAGE_PROVIDER: "s3",
				S3_BUCKET: "bns-media",
				S3_PRIVATE_BUCKET: "",
			}),
		).toContain("S3_PRIVATE_BUCKET");
	});

	it("refuses a private bucket equal to the public one", () => {
		expect(
			assertPrivateStorageConfig({
				STORAGE_PROVIDER: "s3",
				S3_BUCKET: "bns-media",
				S3_PRIVATE_BUCKET: "bns-media",
			}),
		).toContain("same bucket");
	});

	it("refuses an empty private container on Azure", () => {
		expect(
			assertPrivateStorageConfig({
				STORAGE_PROVIDER: "azure",
				AZURE_STORAGE_CONTAINER_NAME: "media",
				AZURE_STORAGE_PRIVATE_CONTAINER_NAME: "",
			}),
		).toContain("AZURE_STORAGE_PRIVATE_CONTAINER_NAME");
	});

	it("refuses the local provider in production and allows it elsewhere", () => {
		expect(
			assertPrivateStorageConfig({
				STORAGE_PROVIDER: "local",
				NODE_ENV: "production",
			}),
		).toContain("local");
		expect(
			assertPrivateStorageConfig({
				STORAGE_PROVIDER: "local",
				NODE_ENV: "development",
			}),
		).toBeNull();
	});
});

describe("local signed file tokens", () => {
	const originalSecret = process.env.PAYLOAD_SECRET;
	process.env.PAYLOAD_SECRET = "test-secret";

	it("accepts its own signature before the deadline", () => {
		const exp = Date.now() + 60_000;
		expect(
			verifyLocalFileToken("doc-1", exp, signLocalFileToken("doc-1", exp)),
		).toBe(true);
	});

	it("refuses an expired token", () => {
		const exp = Date.now() - 1;
		expect(
			verifyLocalFileToken("doc-1", exp, signLocalFileToken("doc-1", exp)),
		).toBe(false);
	});

	it("refuses a signature minted for another document", () => {
		const exp = Date.now() + 60_000;
		expect(
			verifyLocalFileToken("doc-2", exp, signLocalFileToken("doc-1", exp)),
		).toBe(false);
	});

	it("refuses a tampered deadline", () => {
		const exp = Date.now() + 60_000;
		const sig = signLocalFileToken("doc-1", exp);
		expect(verifyLocalFileToken("doc-1", exp + 60_000, sig)).toBe(false);
	});

	it("refuses a malformed signature without throwing", () => {
		expect(verifyLocalFileToken("doc-1", Date.now() + 60_000, "nonsense")).toBe(
			false,
		);
		expect(verifyLocalFileToken("doc-1", Number.NaN, "")).toBe(false);
	});

	process.env.PAYLOAD_SECRET = originalSecret;
});
