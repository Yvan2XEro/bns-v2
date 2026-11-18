export type CsvCell = string | number | null | undefined;

function cell(value: CsvCell): string {
	if (value === null || value === undefined) return "";
	const text = String(value);
	return /[",;\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 rows; the BOM makes spreadsheet apps read the accents as UTF-8. */
export function toCsv(header: readonly string[], rows: readonly CsvCell[][]) {
	return `﻿${[header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}

/** Hands the text to the browser as a file; nothing leaves the page. */
export function downloadCsv(filename: string, csv: string) {
	const url = URL.createObjectURL(
		new Blob([csv], { type: "text/csv;charset=utf-8" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}
