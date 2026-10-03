import type { CommissionInvoice, CommissionLine } from "../payload-types";
import { formatXaf } from "./orderFormat";
import { type PdfLine, renderTextPdf } from "./textPdf";

export interface InvoiceDocumentLine {
	orderNumber: string;
	baseAmount: number;
	amount: number;
	kind: CommissionLine["kind"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, key: string): string | null {
	if (!isRecord(value)) return null;
	const field = value[key];
	return typeof field === "string" ? field : null;
}

/** Same rule as `orderReceipt.ts`'s `escapeHtml`: every interpolated value
 * goes through this, including a shop's own display name, which it is free
 * to fill with anything. */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function formatDate(iso: string, lang: "fr" | "en"): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return escapeHtml(iso);
	return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
		dateStyle: "medium",
	}).format(date);
}

const copy = {
	fr: {
		title: "Facture de commission",
		invoice: "Facture",
		period: "Periode",
		issuedOn: "Emise le",
		dueOn: "Echeance",
		issuer: "Emetteur",
		seller: "Vendeur",
		order: "Commande",
		kind: "Nature",
		base: "Base",
		amount: "Montant",
		commissionTotal: "Total commission",
		vat: "TVA",
		totalDue: "Total a payer",
		kinds: {
			charge: "Commission",
			credit: "Avoir",
			carry_over: "Report",
			resale_margin: "Marge revente",
		},
	},
	en: {
		title: "Commission invoice",
		invoice: "Invoice",
		period: "Period",
		issuedOn: "Issued on",
		dueOn: "Due",
		issuer: "Issuer",
		seller: "Seller",
		order: "Order",
		kind: "Kind",
		base: "Base",
		amount: "Amount",
		commissionTotal: "Commission total",
		vat: "VAT",
		totalDue: "Total due",
		kinds: {
			charge: "Commission",
			credit: "Credit",
			carry_over: "Carry-over",
			resale_margin: "Resale margin",
		},
	},
} as const;

/**
 * A self-contained HTML document for
 * `GET /api/commission-invoices/{id}/document`: the issuer and seller
 * snapshots as they were captured when the invoice was issued, never from
 * the shop's current record, so a later edit to the shop's legal details
 * does not retroactively change a document already sent.
 */
export function renderInvoiceHtml(
	invoice: CommissionInvoice,
	lines: ReadonlyArray<InvoiceDocumentLine>,
	lang: "fr" | "en",
): string {
	const t = copy[lang];
	const seller = invoice.sellerSnapshot;
	const issuer = invoice.issuerSnapshot;

	const rows = lines
		.map(
			(line) => `
			<tr>
				<td>${escapeHtml(line.orderNumber)}</td>
				<td>${escapeHtml(t.kinds[line.kind])}</td>
				<td>${escapeHtml(formatXaf(line.baseAmount, lang))}</td>
				<td>${escapeHtml(formatXaf(line.amount, lang))}</td>
			</tr>`,
		)
		.join("");

	return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${t.title} — ${escapeHtml(invoice.invoiceNumber)}</title>
<style>
	body { font-family: sans-serif; color: #111; }
	table { width: 100%; border-collapse: collapse; margin: 1em 0; }
	td, th { padding: 4px 8px; border-bottom: 1px solid #ddd; text-align: left; }
	@media print { body { color: #000; } }
</style>
</head>
<body>
<h1>${t.title}</h1>
<p>${t.invoice}: ${escapeHtml(invoice.invoiceNumber)}</p>
<p>${t.period}: ${formatDate(invoice.periodStart ?? "", lang)} — ${formatDate(invoice.periodEnd ?? "", lang)}</p>
<p>${t.issuedOn}: ${formatDate(invoice.issuedAt ?? "", lang)}</p>
<p>${t.dueOn}: ${formatDate(invoice.dueAt ?? "", lang)}</p>
<p>${t.issuer}: ${escapeHtml(str(issuer, "legalName") ?? "")}</p>
<p>${t.seller}: ${escapeHtml(str(seller, "name") ?? "")}${
		str(seller, "legalName")
			? ` (${escapeHtml(str(seller, "legalName") ?? "")})`
			: ""
	}</p>
<table>
	<thead>
		<tr>
			<th>${t.order}</th>
			<th>${t.kind}</th>
			<th>${t.base}</th>
			<th>${t.amount}</th>
		</tr>
	</thead>
	<tbody>${rows}</tbody>
</table>
<p>${t.commissionTotal}: ${escapeHtml(formatXaf(invoice.commissionTotal ?? 0, lang))}</p>
<p>${t.vat}: ${escapeHtml(formatXaf(invoice.vatAmount ?? 0, lang))}</p>
<p>${t.totalDue}: ${escapeHtml(formatXaf(invoice.totalDue ?? 0, lang))}</p>
</body>
</html>`;
}

// ─── Series F: the buyer protection fee invoice and its credit note ─────────

export interface BuyerFeeDocument {
	kind: "invoice" | "credit_note";
	number: string;
	/** The invoice a credit note cancels. */
	creditsNumber: string | null;
	issuedAt: string;
	/** When the buyer's payment succeeded; invoices only. */
	paidAt: string | null;
	orderNumber: string;
	customerName: string;
	amountHt: number;
	vat: number;
	amountTtc: number;
	vatRateBps: number;
	issuer: { legalName: string; supportEmail: string };
}

/** French first: Law 2011/012 art. 6 wants both, these are PDFs, so accented. */
export const BUYER_FEE_DOCUMENT_COPY = {
	fr: {
		invoiceTitle: "Facture — frais de protection acheteur",
		creditNoteTitle: "Avoir — frais de protection acheteur",
		number: "Numéro",
		issuedOn: "Date d'émission",
		credits: "Avoir sur la facture",
		order: "Commande",
		customer: "Client",
		description: "Désignation",
		service: "Service de protection acheteur",
		amountHt: "Montant HT",
		vat: "TVA",
		amountTtc: "Montant TTC",
		paidOn: "Payée par mobile money le",
		refunded: "Montant remboursé au client",
		issuer: "Émetteur",
		contact: "Contact",
	},
	en: {
		invoiceTitle: "Invoice — buyer protection fee",
		creditNoteTitle: "Credit note — buyer protection fee",
		number: "Number",
		issuedOn: "Issue date",
		credits: "Credits invoice",
		order: "Order",
		customer: "Customer",
		description: "Description",
		service: "Buyer protection service",
		amountHt: "Amount excl. VAT",
		vat: "VAT",
		amountTtc: "Amount incl. VAT",
		paidOn: "Paid by mobile money on",
		refunded: "Amount refunded to the customer",
		issuer: "Issuer",
		contact: "Contact",
	},
} as const;

function longDate(iso: string, lang: "fr" | "en"): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
		dateStyle: "long",
		timeZone: "Africa/Douala",
	}).format(date);
}

/** `1925` → `19,25 %` / `19.25%`. */
export function formatVatRate(bps: number, lang: "fr" | "en"): string {
	const percent = (bps / 100).toFixed(2).replace(/\.?0+$/, "");
	return lang === "fr" ? `${percent.replace(".", ",")} %` : `${percent}%`;
}

function feeSection(doc: BuyerFeeDocument, lang: "fr" | "en"): PdfLine[] {
	const t = BUYER_FEE_DOCUMENT_COPY[lang];
	const credit = doc.kind === "credit_note";
	// French typography puts a space before the colon.
	const colon = lang === "fr" ? " :" : ":";
	const lines: PdfLine[] = [
		{
			text: credit ? t.creditNoteTitle : t.invoiceTitle,
			bold: true,
			size: 14,
			gap: 12,
		},
		{ text: `${t.number}${colon} ${doc.number}` },
		{ text: `${t.issuedOn}${colon} ${longDate(doc.issuedAt, lang)}` },
	];
	if (credit && doc.creditsNumber) {
		lines.push({ text: `${t.credits}${colon} ${doc.creditsNumber}` });
	}
	lines.push(
		{ text: `${t.issuer}${colon} ${doc.issuer.legalName}` },
		{ text: `${t.contact}${colon} ${doc.issuer.supportEmail}` },
		{ text: `${t.order}${colon} ${doc.orderNumber}` },
		{ text: `${t.customer}${colon} ${doc.customerName}` },
		{ text: `${t.description}${colon} ${t.service}`, gap: 6 },
		{ text: `${t.amountHt}${colon} ${formatXaf(doc.amountHt, lang)}` },
		{
			text: `${t.vat} (${formatVatRate(doc.vatRateBps, lang)})${colon} ${formatXaf(doc.vat, lang)}`,
		},
		{
			text: `${t.amountTtc}${colon} ${formatXaf(doc.amountTtc, lang)}`,
			bold: true,
		},
	);
	if (credit) {
		lines.push({ text: t.refunded, gap: 6 });
	} else if (doc.paidAt) {
		lines.push({ text: `${t.paidOn} ${longDate(doc.paidAt, lang)}`, gap: 6 });
	}
	return lines;
}

/** Pure: the document's text, French section then English. */
export function buyerFeeDocumentLines(doc: BuyerFeeDocument): PdfLine[] {
	return [...feeSection(doc, "fr"), ...feeSection(doc, "en")];
}

export function renderBuyerFeeDocumentPdf(doc: BuyerFeeDocument): Buffer {
	return renderTextPdf(buyerFeeDocumentLines(doc));
}
