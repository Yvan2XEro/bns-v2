import type { ContractSnapshot } from "./orderContract";
import { formatXaf } from "./orderFormat";

export interface ReceiptInput {
	orderNumber: string;
	/** ISO timestamp the order was placed. */
	orderDate: string;
	/** ISO timestamp this document was generated. */
	printedAt: string;
	snapshot: ContractSnapshot;
	snapshotHash: string;
}

/** This is a printable document served to a browser: every interpolated
 * value goes through this before it reaches the HTML, including values that
 * already look safe — a shop is free to pick any display name. */
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
		timeStyle: "short",
	}).format(date);
}

function withdrawalDeadline(orderDate: string, days: number): Date {
	const deadline = new Date(orderDate);
	deadline.setUTCDate(deadline.getUTCDate() + days);
	return deadline;
}

const copy = {
	fr: {
		title: "Recu de commande",
		order: "Commande",
		orderedOn: "Commandee le",
		printedOn: "Imprime le",
		seller: "Vendeur",
		platform: "Plateforme d'hebergement",
		item: "Article",
		quantity: "Quantite",
		unitPrice: "Prix unitaire",
		lineTotal: "Total ligne",
		subtotal: "Sous-total articles",
		deliveryFee: "Frais de livraison",
		total: "Total a payer",
		withdrawalUntil: "Date limite de retractation",
		hash: "Empreinte du contrat",
	},
	en: {
		title: "Order receipt",
		order: "Order",
		orderedOn: "Ordered on",
		printedOn: "Printed on",
		seller: "Seller",
		platform: "Hosting platform",
		item: "Item",
		quantity: "Quantity",
		unitPrice: "Unit price",
		lineTotal: "Line total",
		subtotal: "Items subtotal",
		deliveryFee: "Delivery fee",
		total: "Total due",
		withdrawalUntil: "Withdrawal deadline",
		hash: "Contract fingerprint",
	},
} as const;

/**
 * A self-contained HTML document (print styles included) for
 * `GET /api/orders/{id}/receipt`: the buyer's proof of what they were shown,
 * built from the stored snapshot rather than from current settings.
 */
export function renderReceiptHtml(
	input: ReceiptInput,
	lang: "fr" | "en",
): string {
	const t = copy[lang];
	const { snapshot } = input;
	const deadline = withdrawalDeadline(
		input.orderDate,
		snapshot.withdrawal.days,
	);

	const rows = snapshot.items
		.map(
			(item) => `
			<tr>
				<td>${escapeHtml(item.title)}${
					item.variantLabel ? ` — ${escapeHtml(item.variantLabel)}` : ""
				}</td>
				<td>${item.quantity}</td>
				<td>${escapeHtml(formatXaf(item.unitPrice, lang))}</td>
				<td>${escapeHtml(formatXaf(item.lineSubtotal, lang))}</td>
			</tr>`,
		)
		.join("");

	return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${t.title} — ${escapeHtml(input.orderNumber)}</title>
<style>
	body { font-family: sans-serif; color: #111; }
	table { width: 100%; border-collapse: collapse; margin: 1em 0; }
	td, th { padding: 4px 8px; border-bottom: 1px solid #ddd; text-align: left; }
	@media print { body { color: #000; } }
</style>
</head>
<body>
<h1>${t.title}</h1>
<p>${t.order}: ${escapeHtml(input.orderNumber)}</p>
<p>${t.orderedOn}: ${formatDate(input.orderDate, lang)}</p>
<p>${t.printedOn}: ${formatDate(input.printedAt, lang)}</p>
<p>${t.seller}: ${escapeHtml(snapshot.seller.name)} (${escapeHtml(snapshot.seller.handle)})</p>
<p>${t.platform}: ${escapeHtml(snapshot.platform.legalName)}</p>
<table>
	<thead>
		<tr>
			<th>${t.item}</th>
			<th>${t.quantity}</th>
			<th>${t.unitPrice}</th>
			<th>${t.lineTotal}</th>
		</tr>
	</thead>
	<tbody>${rows}</tbody>
</table>
<p>${t.subtotal}: ${escapeHtml(formatXaf(snapshot.amounts.subtotal, lang))}</p>
<p>${t.deliveryFee}: ${escapeHtml(formatXaf(snapshot.amounts.deliveryFee, lang))}</p>
<p>${t.total}: ${escapeHtml(formatXaf(snapshot.amounts.total, lang))}</p>
<p>${t.withdrawalUntil}: ${formatDate(deadline.toISOString(), lang)}</p>
<p>${t.hash}: ${escapeHtml(input.snapshotHash)}</p>
</body>
</html>`;
}
