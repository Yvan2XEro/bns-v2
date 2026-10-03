import type { ContractSnapshot } from "./orderContract";
import { formatXaf } from "./orderFormat";

export interface ReceiptInput {
	orderNumber: string;
	/** ISO timestamp the order was placed. */
	orderDate: string;
	/** ISO timestamp this document was generated. */
	printedAt: string;
	/** `order.deadlines.withdrawalUntil`: set on delivery, null before it. */
	withdrawalUntil: string | null;
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
	// Africa/Douala, not the server's zone: this document states a statutory
	// deadline, and a date rendered in UTC can name the wrong calendar day
	// for the buyer reading it in Cameroon.
	return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Africa/Douala",
	}).format(date);
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
		withdrawalRule: (days: number) =>
			`Delai de retractation: ${days} jours a compter de la reception du colis. La date exacte figurera sur ce recu si la commande est livree.`,
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
		withdrawalRule: (days: number) =>
			`Withdrawal period: ${days} days from receiving the parcel. The exact date will appear on this receipt if the order is delivered.`,
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
	// The legal window runs from delivery, so no date exists before it: a
	// date counted from the order would always be earlier than the real one.
	const withdrawal = input.withdrawalUntil
		? `${t.withdrawalUntil}: ${formatDate(input.withdrawalUntil, lang)}`
		: t.withdrawalRule(snapshot.withdrawal.days);

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
<p>${withdrawal}</p>
<p>${t.hash}: ${escapeHtml(input.snapshotHash)}</p>
</body>
</html>`;
}
