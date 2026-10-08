/** Reads TIFF DateTimeOriginal (0x9003) from an EXIF payload without decoding images. */
export function exifDateOriginal(exif: Buffer | Uint8Array): string | null {
	const input = Buffer.from(exif);
	const bytes =
		input.toString("ascii", 0, 6) === "Exif\0\0" ? input.subarray(6) : input;
	if (bytes.length < 8) return null;
	const byteOrder = bytes.toString("ascii", 0, 2);
	const littleEndian = byteOrder === "II";
	if (!littleEndian && byteOrder !== "MM") return null;
	const read16 = (offset: number) => {
		if (offset < 0 || offset + 2 > bytes.length) return null;
		return littleEndian
			? bytes.readUInt16LE(offset)
			: bytes.readUInt16BE(offset);
	};
	const read32 = (offset: number) => {
		if (offset < 0 || offset + 4 > bytes.length) return null;
		return littleEndian
			? bytes.readUInt32LE(offset)
			: bytes.readUInt32BE(offset);
	};
	if (read16(2) !== 42) return null;
	const firstIfd = read32(4);
	if (firstIfd === null) return null;
	const exifPointer = findIfdValue(
		bytes,
		firstIfd,
		0x8769,
		read16,
		read32,
		4,
		1,
	);
	if (exifPointer === null) return null;
	const dateOffset = findIfdValue(
		bytes,
		exifPointer,
		0x9003,
		read16,
		read32,
		2,
		20,
	);
	if (dateOffset === null || dateOffset + 20 > bytes.length) return null;
	const raw = bytes
		.toString("ascii", dateOffset, dateOffset + 20)
		.replace(/\0+$/, "");
	const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw);
	if (!match) return null;
	const [, year, month, day, hour, minute, second] = match;
	const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
	if (
		Number.isNaN(date.getTime()) ||
		date.toISOString().slice(0, 19) !==
			`${year}-${month}-${day}T${hour}:${minute}:${second}`
	) {
		return null;
	}
	return date.toISOString();
}

function findIfdValue(
	bytes: Buffer,
	ifdOffset: number,
	tag: number,
	read16: (offset: number) => number | null,
	read32: (offset: number) => number | null,
	expectedType: number,
	expectedCount: number,
): number | null {
	const count = read16(ifdOffset);
	if (count === null || count > 512) return null;
	for (let index = 0; index < count; index += 1) {
		const entry = ifdOffset + 2 + index * 12;
		if (entry + 12 > bytes.length) return null;
		if (read16(entry) !== tag) continue;
		const type = read16(entry + 2);
		const valueCount = read32(entry + 4);
		if (type !== expectedType || valueCount !== expectedCount) return null;
		const valueSize =
			type === 2 ? valueCount : type === 3 ? valueCount * 2 : valueCount * 4;
		if (valueSize <= 4) {
			return type === 4 && valueCount === 1 ? read32(entry + 8) : entry + 8;
		}
		const offset = read32(entry + 8);
		if (offset === null || offset + valueSize > bytes.length) return null;
		return offset;
	}
	return null;
}
