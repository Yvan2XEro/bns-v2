import type { CommissionInvoice, CommissionLine } from "../payload-types";
import { formatXaf } from "./orderFormat";

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
