// @vitest-environment node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signLocalFileToken } from "../../src/lib/privateFiles";

const { getPayloadMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	getPayload: getPayloadMock,
}));

describe("delivery proof signed file route", () => {
	afterEach(() => {
		process.env.PAYLOAD_SECRET = undefined;
		process.env.PRIVATE_UPLOADS_DIR = undefined;
		vi.clearAllMocks();
	});

	it("refuses an expired signature before looking up the proof or reading storage", async () => {
		process.env.PAYLOAD_SECRET = "test-delivery-proof-secret";
		const { GET } = await import(
			"../../src/app/(frontend)/api/delivery-proofs/files/[docId]/route"
		);
		const expiresAt = Date.now() - 1;
		const response = await GET(
			new Request(
				`http://localhost/api/delivery-proofs/files/proof-1?exp=${expiresAt}&sig=expired`,
			),
			{ params: Promise.resolve({ docId: "proof-1" }) },
		);

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "generic.forbidden" });
		expect(getPayloadMock).not.toHaveBeenCalled();
	}, 20_000);

	it("serves a valid signed proof file with private no-store headers", async () => {
		process.env.PAYLOAD_SECRET = "test-delivery-proof-secret";
		const privateDir = path.join(
			"/tmp",
			`p7-proof-${process.pid}-${Date.now()}`,
			"private-uploads",
			"verification",
		);
		process.env.PRIVATE_UPLOADS_DIR = privateDir;
		const storageDir = path.resolve(privateDir, "..", "delivery-proofs");
		await mkdir(storageDir, { recursive: true });
		const contents = Buffer.from("private delivery proof");
		await writeFile(path.join(storageDir, "handover.jpg"), contents);
		const expiresAt = Date.now() + 60_000;
		const signature = signLocalFileToken("proof-1", expiresAt);
		getPayloadMock.mockResolvedValue({
			findByID: vi.fn(async () => ({
				id: "proof-1",
				filename: "handover.jpg",
				mimeType: "image/jpeg",
			})),
		});

		try {
			const { GET } = await import(
				"../../src/app/(frontend)/api/delivery-proofs/files/[docId]/route"
			);
			const response = await GET(
				new Request(
					`http://localhost/api/delivery-proofs/files/proof-1?exp=${expiresAt}&sig=${signature}`,
				),
				{ params: Promise.resolve({ docId: "proof-1" }) },
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("image/jpeg");
			expect(response.headers.get("Cache-Control")).toBe("no-store");
			expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
			expect(Buffer.from(await response.arrayBuffer())).toEqual(contents);
			expect(await readFile(path.join(storageDir, "handover.jpg"))).toEqual(
				contents,
			);
		} finally {
			await rm(path.resolve(privateDir, "..", ".."), {
				recursive: true,
				force: true,
			});
		}
	}, 20_000);
});
