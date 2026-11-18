import { html, type SafeHtml, trusted } from "./html";

export type PrintLang = "fr" | "en";

export interface PrintDocumentInput {
	lang: PrintLang;
	/** The document's name: "Feuille d'inventaire". */
	title: string;
	/** Who the document is for or from, printed above the title. */
	issuer: string;
	/** Key facts under the title (date, counts…). */
	meta: { label: string; value: string }[];
	body: SafeHtml;
	/** Repeated at the foot of every page, next to the page number. */
	footer: string;
	/** Opens the print dialog once loaded (the website's "Print" button). */
	autoprint?: boolean;
	/**
	 * Drop the on-screen toolbar: the app shows the document in a WebView
	 * with its own buttons.
	 */
	embedded?: boolean;
}

const LABELS: Record<
	PrintLang,
	{ print: string; close: string; page: string; of: string }
> = {
	fr: { print: "Imprimer", close: "Fermer", page: "Page", of: "sur" },
	en: { print: "Print", close: "Close", page: "Page", of: "of" },
};

/**
 * A CSS string for `content:`. A footer may hold any character, and it sits
 * inside <style>: `<` is escaped too, so no name can close the element.
 */
function cssString(value: string): string {
	const escaped = value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/</g, "\\3C ")
		.replace(/[\r\n]+/g, " ");
	return `"${escaped}"`;
}

/**
 * The paper: A4 with print margins, a running footer and "Page n of m" in
 * the page margins (Chrome, Edge, Safari 18), the table header repeated on
 * every page, rows never split across two. On screen the same sheet shows
 * on a grey desk with a toolbar that is not printed.
 */
function styles(footer: string, labels: (typeof LABELS)[PrintLang]): string {
	return `
@page {
	size: A4;
	margin: 14mm 13mm 16mm;
	@bottom-left { content: ${cssString(footer)}; font: 8pt system-ui, sans-serif; color: #64748b; }
	@bottom-right { content: ${cssString(`${labels.page} `)} counter(page) ${cssString(` ${labels.of} `)} counter(pages); font: 8pt system-ui, sans-serif; color: #64748b; }
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
	margin: 0;
	font: 10pt/1.4 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
	color: #0f172a;
	background: #e2e8f0;
}
.toolbar {
	position: sticky; top: 0; z-index: 1;
	display: flex; justify-content: flex-end; gap: 8px;
	padding: 10px 16px; background: #0f172a;
}
.toolbar button {
	font: 600 13px system-ui, sans-serif; border: 0; border-radius: 8px;
	padding: 8px 14px; cursor: pointer;
}
.toolbar .primary { background: #ffffff; color: #0f172a; }
.toolbar .secondary { background: transparent; color: #cbd5e1; }
.sheet {
	width: 210mm; min-height: 297mm; margin: 24px auto; padding: 14mm 13mm;
	background: #ffffff; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
}
header.doc { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end;
	padding-bottom: 10px; border-bottom: 2px solid #0f172a; margin-bottom: 14px; }
.issuer { font-size: 9pt; color: #475569; text-transform: uppercase; letter-spacing: 0.06em; }
h1 { margin: 2px 0 0; font-size: 18pt; line-height: 1.15; }
dl.meta { display: grid; grid-template-columns: auto auto; gap: 2px 12px; margin: 0; font-size: 9pt; }
dl.meta dt { color: #64748b; }
dl.meta dd { margin: 0; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
.fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 18px; margin: 0 0 14px; font-size: 9pt; }
.field span { color: #64748b; }
.field .line { height: 18px; border-bottom: 1px solid #94a3b8; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
thead { display: table-header-group; }
th { text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: #475569;
	border-bottom: 1.5px solid #0f172a; padding: 6px 6px; }
td { border-bottom: 0.5px solid #cbd5e1; padding: 6px 6px; vertical-align: top; }
tr { break-inside: avoid; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.muted { color: #64748b; }
.small { font-size: 8pt; }
.box { display: inline-block; width: 22mm; height: 7mm; border: 1px solid #64748b; border-radius: 2px; }
.group td { background: #f1f5f9; font-weight: 700; font-size: 8.5pt; border-bottom: 1px solid #94a3b8;
	break-after: avoid; }
.signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 22px; break-inside: avoid; }
.signature { border: 1px solid #94a3b8; border-radius: 4px; padding: 8px 10px; height: 28mm; font-size: 9pt; color: #475569; }
.note { margin-top: 12px; font-size: 8.5pt; color: #475569; }
@media print {
	body { background: #ffffff; }
	.toolbar { display: none; }
	.sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
}
@media screen and (max-width: 820px) {
	.sheet { width: auto; min-height: 0; margin: 0; padding: 16px; box-shadow: none; }
	.fields { grid-template-columns: 1fr; }
}`;
}

/** A complete printable page: one HTML file, no external asset. */
export function printDocument(input: PrintDocumentInput): string {
	const labels = LABELS[input.lang];
	const toolbar = input.embedded
		? null
		: html`<div class="toolbar">
				<button type="button" class="secondary" onclick="window.close()">${labels.close}</button>
				<button type="button" class="primary" onclick="window.print()">${labels.print}</button>
			</div>`;
	const autoprint = input.autoprint
		? trusted(
				"<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},150)})</script>",
			)
		: null;

	return `<!doctype html>${
		html`<html lang="${input.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${input.title} · ${input.issuer}</title>
<style>${trusted(styles(input.footer, labels))}</style>
</head>
<body>
${toolbar}
<main class="sheet">
	<header class="doc">
		<div>
			<div class="issuer">${input.issuer}</div>
			<h1>${input.title}</h1>
		</div>
		<dl class="meta">
			${input.meta.map((item) => html`<dt>${item.label}</dt><dd>${item.value}</dd>`)}
		</dl>
	</header>
	${input.body}
</main>
${autoprint}
</body>
</html>`.value
	}`;
}
