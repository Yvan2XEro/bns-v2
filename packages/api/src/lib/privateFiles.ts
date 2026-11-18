import { createHmac, timingSafeEqual } from "node:crypto";

export interface PrivateDoc {
	id: string;
	filename: string;
	mimeType?: string | null;
	/** Storage prefix, when the adapter was configured with one. */
	prefix?: string | null;
}

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 60;

/**
 * The plugin's own `signedDownloads` is not used: it has no hook to write the
 * view log, and an identity document that can be opened without leaving a
 * record is the one thing this design does not allow.
 */
export async function createSignedDocumentUrl(
	doc: PrivateDoc,
	ttlSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS,
	/** The route that serves this collection under the local provider. */
	localRoute = "/api/verification/files",
): Promise<{ url: string; expiresAt: Date }> {
	const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
	const provider = process.env.STORAGE_PROVIDER?.toLowerCase();
	const key = doc.prefix ? `${doc.prefix}/${doc.filename}` : doc.filename;

	if (provider === "s3") {
		const [{ GetObjectCommand, S3Client }, { getSignedUrl }] =
			await Promise.all([
				import("@aws-sdk/client-s3"),
				import("@aws-sdk/s3-request-presigner"),
			]);
		const client = new S3Client({
			region: process.env.S3_REGION ?? "us-east-1",
			credentials: {
				accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
				secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
			},
			...(process.env.S3_ENDPOINT && {
				endpoint: process.env.S3_ENDPOINT,
				forcePathStyle: true,
			}),
		});
		const url = await getSignedUrl(
			client,
			new GetObjectCommand({
				Bucket: process.env.S3_PRIVATE_BUCKET ?? "",
				Key: key,
				ResponseContentDisposition: "inline",
				ResponseCacheControl: "no-store",
			}),
			{ expiresIn: ttlSeconds },
		);
		return { url, expiresAt };
	}

	if (provider === "azure") {
		const { BlobServiceClient, BlobSASPermissions } = await import(
			"@azure/storage-blob"
		);
		const service = BlobServiceClient.fromConnectionString(
			process.env.AZURE_STORAGE_CONNECTION_STRING ?? "",
		);
		const blob = service
			.getContainerClient(
				process.env.AZURE_STORAGE_PRIVATE_CONTAINER_NAME ?? "",
			)
			.getBlobClient(key);
		const url = await blob.generateSasUrl({
			permissions: BlobSASPermissions.parse("r"),
			expiresOn: expiresAt,
			cacheControl: "no-store",
			contentDisposition: "inline",
		});
		return { url, expiresAt };
	}

	const exp = expiresAt.getTime();
	const sig = signLocalFileToken(doc.id, exp);
	return {
		url: `${localRoute}/${encodeURIComponent(doc.id)}?exp=${exp}&sig=${sig}`,
		expiresAt,
	};
}

function localKey(): Buffer {
	const secret = process.env.PAYLOAD_SECRET ?? "";
	if (!secret) {
		throw new Error(
			"PAYLOAD_SECRET is not set; cannot sign a local document URL",
		);
	}
	return createHmac("sha256", secret).update("verification-files").digest();
}

export function signLocalFileToken(docId: string, expiresAtMs: number): string {
	return createHmac("sha256", localKey())
		.update(`${docId}:${expiresAtMs}`)
		.digest("hex");
}

/** Constant-time, and false for anything malformed rather than throwing. */
export function verifyLocalFileToken(
	docId: string,
	expiresAtMs: number,
	signature: string,
): boolean {
	if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return false;
	let expected: Buffer;
	let given: Buffer;
	try {
		expected = Buffer.from(signLocalFileToken(docId, expiresAtMs), "hex");
		given = Buffer.from(signature, "hex");
	} catch {
		return false;
	}
	return expected.length === given.length && timingSafeEqual(expected, given);
}
