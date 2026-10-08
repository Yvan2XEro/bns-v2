// @vitest-environment node
import { describe, expect, it } from "vitest";
import { exifDateOriginal } from "../../src/lib/exifDate";

function dateExif(value: string): Buffer {
	const bytes = Buffer.alloc(64);
	bytes.write("II", 0, "ascii");
	bytes.writeUInt16LE(42, 2);
	bytes.writeUInt32LE(8, 4);
	bytes.writeUInt16LE(1, 8);
	bytes.writeUInt16LE(0x8769, 10);
	bytes.writeUInt16LE(4, 12);
	bytes.writeUInt32LE(1, 14);
	bytes.writeUInt32LE(26, 18);
	bytes.writeUInt16LE(1, 26);
	bytes.writeUInt16LE(0x9003, 28);
	bytes.writeUInt16LE(2, 30);
	bytes.writeUInt32LE(20, 32);
	bytes.writeUInt32LE(44, 36);
	bytes.write(`${value}\0`, 44, "ascii");
	return bytes;
}

describe("exifDateOriginal", () => {
	it("reads DateTimeOriginal from a bounded TIFF IFD", () => {
		expect(exifDateOriginal(dateExif("2026:10:04 08:07:06"))).toBe(
			"2026-10-04T08:07:06.000Z",
		);
		expect(
			exifDateOriginal(
				Buffer.concat([
					Buffer.from("Exif\0\0", "binary"),
					dateExif("2026:10:04 08:07:06"),
				]),
			),
		).toBe("2026-10-04T08:07:06.000Z");
	});

	it("returns null for truncated and invalid date data", () => {
		expect(exifDateOriginal(Buffer.from([0x49, 0x49, 42]))).toBeNull();
		expect(exifDateOriginal(dateExif("2026:02:30 08:07:06"))).toBeNull();
	});
});
