/**
 * A one-page, text-only PDF with no dependency: the standard Helvetica pair
 * under WinAnsiEncoding, which carries every accented letter French needs.
 * Enough for an invoice; nothing here lays out tables or wraps lines.
 */

export interface PdfLine {
	text: string;
	bold?: boolean;
	size?: number;
	/** Extra space above the line, in points. */
	gap?: number;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;

/** The WinAnsi code points outside Latin-1 that French copy actually reaches. */
const WIN_ANSI_EXTRAS = new Map<number, number>([
	[0x20ac, 0x80],
	[0x2026, 0x85],
	[0x0152, 0x8c],
	[0x2018, 0x91],
	[0x2019, 0x92],
	[0x201c, 0x93],
	[0x201d, 0x94],
	[0x2013, 0x96],
	[0x2014, 0x97],
	[0x0153, 0x9c],
	[0x0178, 0x9f],
	// French number grouping (`formatXaf`, `Intl`) uses the narrow no-break
	// space, which WinAnsi lacks: the plain no-break space reads the same.
	[0x202f, 0xa0],
]);

function winAnsiByte(codePoint: number): number {
	if (codePoint >= 0x20 && codePoint <= 0x7e) return codePoint;
	if (codePoint >= 0xa0 && codePoint <= 0xff) return codePoint;
	return WIN_ANSI_EXTRAS.get(codePoint) ?? 0x3f;
}

/** The text as a PDF literal string body: one byte per char, `\ ( )` escaped. */
export function pdfLiteral(text: string): string {
	let out = "";
	for (const char of text) {
		const byte = winAnsiByte(char.codePointAt(0) ?? 0x3f);
		const latin1 = String.fromCharCode(byte);
		out +=
			byte === 0x5c || byte === 0x28 || byte === 0x29 ? `\\${latin1}` : latin1;
	}
	return out;
}

function contentStream(lines: readonly PdfLine[]): string {
	let y = PAGE_HEIGHT - MARGIN;
	const ops: string[] = [];
	for (const line of lines) {
		const size = line.size ?? 10;
		y -= (line.gap ?? 0) + size * 1.4;
		ops.push(
			`BT /${line.bold ? "F2" : "F1"} ${size} Tf ${MARGIN} ${y.toFixed(1)} Td (${pdfLiteral(line.text)}) Tj ET`,
		);
	}
	return ops.join("\n");
}

export function renderTextPdf(lines: readonly PdfLine[]): Buffer {
	const stream = contentStream(lines);
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
		`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
	];
	// Latin-1 throughout, so a string offset is a byte offset.
	let body = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
	const offsets: number[] = [];
	objects.forEach((object, index) => {
		offsets.push(body.length);
		body += `${index + 1} 0 obj\n${object}\nendobj\n`;
	});
	const xref = body.length;
	body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const offset of offsets) {
		body += `${String(offset).padStart(10, "0")} 00000 n \n`;
	}
	body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(body, "latin1");
}
