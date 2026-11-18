// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Media } from "../../src/collections/Media";
import { MAX_MEDIA_FILE_SIZE } from "../../src/hooks/mediaLimits";

const beforeOperation = Media.hooks?.beforeOperation?.[0] as (args: {
	operation: string;
	req: { file?: { mimetype: string; size: number } };
}) => unknown;

const jpegFile = { mimetype: "image/jpeg", size: 500_000 };

describe("Media beforeOperation", () => {
	it("lets a normal image through on create", () => {
		expect(() =>
			beforeOperation({ operation: "create", req: { file: jpegFile } }),
		).not.toThrow();
	});

	it("lets a normal image through on update", () => {
		expect(() =>
			beforeOperation({ operation: "update", req: { file: jpegFile } }),
		).not.toThrow();
	});

	it("refuses a disallowed file type", () => {
		expect(() =>
			beforeOperation({
				operation: "create",
				req: { file: { mimetype: "image/svg+xml", size: 1_000 } },
			}),
		).toThrow(
			expect.objectContaining({
				status: 400,
				data: { code: "upload.invalidType" },
			}),
		);
	});

	it("refuses an oversized upload", () => {
		expect(() =>
			beforeOperation({
				operation: "create",
				req: {
					file: { mimetype: "image/png", size: MAX_MEDIA_FILE_SIZE + 1 },
				},
			}),
		).toThrow(
			expect.objectContaining({
				status: 413,
				data: { code: "upload.tooLarge" },
			}),
		);
	});

	it("does nothing when the operation carries no file", () => {
		expect(() =>
			beforeOperation({ operation: "update", req: {} }),
		).not.toThrow();
	});
});
