import { readFile } from "node:fs/promises";
import qrcode from "qrcode-generator";
import sharp from "sharp";

/**
 * What a card is drawn with, read once per server: DM Sans (the site's
 * font, SIL OFL — fonts/OFL.txt) and the logo. `new URL(…, import.meta.url)`
 * makes the build ship these files with the route.
 */
const read = (path: URL) => readFile(path);

let fonts: Promise<
	{ name: string; data: Buffer; weight: 400 | 600 | 800; style: "normal" }[]
> | null = null;

export function cardFonts() {
	fonts ??= Promise.all([
		read(new URL("./fonts/DMSans_400Regular.ttf", import.meta.url)),
		read(new URL("./fonts/DMSans_600SemiBold.ttf", import.meta.url)),
		read(new URL("./fonts/DMSans_800ExtraBold.ttf", import.meta.url)),
	]).then(([regular, semibold, extrabold]) => [
		{ name: "DM Sans", data: regular, weight: 400, style: "normal" },
		{ name: "DM Sans", data: semibold, weight: 600, style: "normal" },
		{ name: "DM Sans", data: extrabold, weight: 800, style: "normal" },
	]);
	return fonts;
}

let logo: Promise<string> | null = null;

export function cardLogo(): Promise<string> {
	logo ??= read(new URL("./assets/logo.png", import.meta.url)).then(
		(data) => `data:image/png;base64,${data.toString("base64")}`,
	);
	return logo;
}

/**
 * A photo as the card needs it: fetched, cropped to the box it fills, and
 * turned into a JPEG data URI — the card renderer reads neither WebP nor a
 * URL it would have to fetch itself. Null when the photo cannot be had: the
 * card is drawn without it rather than not at all.
 */
export async function cardPhoto(
	url: string | null | undefined,
	width: number,
	height: number,
): Promise<string | null> {
	if (!url) return null;
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!response.ok) return null;
		const jpeg = await sharp(Buffer.from(await response.arrayBuffer()))
			.rotate()
			.resize({ width, height, fit: "cover", position: "attention" })
			.jpeg({ quality: 82, mozjpeg: true })
			.toBuffer();
		return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
	} catch {
		return null;
	}
}

/** A QR code for `value`, as an SVG data URI: sharp at any size. */
export function cardQr(value: string): string {
	const qr = qrcode(0, "M");
	qr.addData(value);
	qr.make();
	const count = qr.getModuleCount();
	let cells = "";
	for (let y = 0; y < count; y++)
		for (let x = 0; x < count; x++)
			if (qr.isDark(y, x)) cells += `M${x} ${y}h1v1h-1z`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${count + 4} ${count + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${count + 4}" height="${count + 4}" fill="#fff"/><path d="${cells}" fill="#0f172a"/></svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * The finished card: the renderer's PNG made a JPEG small enough for its
 * destination (a link preview must stay under 300 KB, or WhatsApp drops it).
 */
export async function cardJpeg(png: ArrayBuffer, maxBytes: number) {
	for (const quality of [84, 76, 68, 60]) {
		const jpeg = await sharp(Buffer.from(png))
			.jpeg({ quality, mozjpeg: true })
			.toBuffer();
		if (jpeg.byteLength <= maxBytes || quality === 60) return jpeg;
	}
	throw new Error("unreachable");
}
