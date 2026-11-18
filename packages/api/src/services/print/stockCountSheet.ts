import type { Payload } from "payload";
import { NOT_ARCHIVED } from "@/collections/ProductVariants";
import { type PrintLang, printDocument } from "@/lib/print/document";
import { html } from "@/lib/print/html";
import { relationId } from "@/lib/relationId";
import { variantLabel } from "@/lib/variants";
import { requireShopMember } from "@/services/shopGuards";
import type { ServiceUser } from "@/services/shops";

const TEXT = {
	fr: {
		title: "Feuille d'inventaire",
		printed: "Imprimée le",
		lines: "Lignes",
		mode: "Mode",
		blind: "Comptage à l'aveugle",
		withExpected: "Avec stock attendu",
		countedBy: "Compté par",
		countDate: "Date du comptage",
		zone: "Zone / rayon",
		product: "Produit · variante",
		sku: "SKU",
		barcode: "Code-barres",
		expected: "Attendu",
		counted: "Compté",
		gap: "Écart",
		notes: "Remarques",
		untracked: "non suivi",
		uncategorized: "Sans catégorie",
		single: "Variante unique",
		signCounter: "Signature de la personne qui a compté",
		signChecker: "Vérifié par (nom, date, signature)",
		note: "Comptez ce qui est physiquement en rayon et en réserve, unités réservées comprises. Reportez ensuite les quantités dans BuyNSellem › Stock › Lancer un inventaire.",
		empty: "Aucun produit à compter dans cette boutique.",
	},
	en: {
		title: "Stock count sheet",
		printed: "Printed on",
		lines: "Lines",
		mode: "Mode",
		blind: "Blind count",
		withExpected: "With expected stock",
		countedBy: "Counted by",
		countDate: "Count date",
		zone: "Area / shelf",
		product: "Product · variant",
		sku: "SKU",
		barcode: "Barcode",
		expected: "Expected",
		counted: "Counted",
		gap: "Gap",
		notes: "Notes",
		untracked: "not tracked",
		uncategorized: "No category",
		single: "Single variant",
		signCounter: "Signature of the person who counted",
		signChecker: "Checked by (name, date, signature)",
		note: "Count what is physically on the shelves and in the back store, reserved units included. Then enter the quantities in BuyNSellem › Stock › Start a stock count.",
		empty: "No products to count in this shop.",
	},
} as const;

export interface StockCountLine {
	category: string;
	product: string;
	variant: string;
	sku: string | null;
	barcode: string | null;
	/** On hand, the figure a count is compared with; null when not tracked. */
	expected: number | null;
}

/** By category, then product, then variant: the order a shelf is walked. */
export function sortCountLines(lines: StockCountLine[]): StockCountLine[] {
	return [...lines].sort(
		(a, b) =>
			a.category.localeCompare(b.category) ||
			a.product.localeCompare(b.product) ||
			a.variant.localeCompare(b.variant),
	);
}

export function renderStockCountSheet(input: {
	lang: PrintLang;
	shopName: string;
	lines: StockCountLine[];
	/** Hide the expected stock, so the count is not steered by it. */
	blind: boolean;
	printedAt: Date;
	autoprint?: boolean;
	embedded?: boolean;
}): string {
	const t = TEXT[input.lang];
	const locale = input.lang === "fr" ? "fr-FR" : "en-GB";
	const number = (value: number) => value.toLocaleString(locale);
	const printed = input.printedAt.toLocaleString(locale, {
		day: "numeric",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
	const lines = sortCountLines(input.lines);
	const columns = input.blind ? 6 : 7;

	let category: string | null = null;
	const rows = lines.map((line, index) => {
		const heading =
			line.category !== category
				? html`<tr class="group"><td colspan="${String(columns)}">${line.category}</td></tr>`
				: null;
		category = line.category;
		return html`${heading}<tr>
			<td class="num muted small">${String(index + 1)}</td>
			<td><strong>${line.product}</strong>${line.variant ? html`<br><span class="muted small">${line.variant}</span>` : null}</td>
			<td class="small">${line.sku ?? "—"}${line.barcode ? html`<br><span class="muted">${line.barcode}</span>` : null}</td>
			${
				input.blind
					? null
					: html`<td class="num">${line.expected === null ? html`<span class="muted small">${t.untracked}</span>` : number(line.expected)}</td>`
			}
			<td class="num"><span class="box"></span></td>
			<td class="num"><span class="box"></span></td>
			<td></td>
		</tr>`;
	});

	const body = html`
		<div class="fields">
			<div class="field"><span>${t.countedBy}</span><div class="line"></div></div>
			<div class="field"><span>${t.countDate}</span><div class="line"></div></div>
			<div class="field"><span>${t.zone}</span><div class="line"></div></div>
		</div>
		${
			lines.length === 0
				? html`<p class="muted">${t.empty}</p>`
				: html`<table>
					<thead><tr>
						<th class="num">#</th>
						<th>${t.product}</th>
						<th>${t.sku} · ${t.barcode}</th>
						${input.blind ? null : html`<th class="num">${t.expected}</th>`}
						<th class="num">${t.counted}</th>
						<th class="num">${t.gap}</th>
						<th>${t.notes}</th>
					</tr></thead>
					<tbody>${rows}</tbody>
				</table>`
		}
		<p class="note">${t.note}</p>
		<div class="signatures">
			<div class="signature">${t.signCounter}</div>
			<div class="signature">${t.signChecker}</div>
		</div>`;

	return printDocument({
		lang: input.lang,
		title: t.title,
		issuer: input.shopName,
		meta: [
			{ label: t.printed, value: printed },
			{ label: t.lines, value: number(lines.length) },
			{ label: t.mode, value: input.blind ? t.blind : t.withExpected },
		],
		body,
		footer: `${input.shopName} · ${t.title} · ${printed}`,
		autoprint: input.autoprint,
		embedded: input.embedded,
	});
}

/**
 * The shop's printable count sheet: every live variant, by category and
 * product, with blank boxes for the counted figure and the gap. Any member
 * may print it, as any member may count.
 */
export async function stockCountSheetHtml(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	options: {
		lang: PrintLang;
		blind: boolean;
		autoprint?: boolean;
		embedded?: boolean;
	},
): Promise<string> {
	const { shop } = await requireShopMember(payload, user, shopId);
	const t = TEXT[options.lang];

	const { docs: variants } = await payload.find({
		collection: "product-variants",
		where: {
			and: [{ shop: { equals: shopId } }, NOT_ARCHIVED],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const productIds = [
		...new Set(
			variants
				.map((variant) => relationId(variant.product))
				.filter((id): id is string => Boolean(id)),
		),
	];
	const { docs: products } = productIds.length
		? await payload.find({
				collection: "products",
				where: { id: { in: productIds } },
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
			})
		: { docs: [] };
	const categoryIds = [
		...new Set(
			products
				.map((product) => relationId(product.category))
				.filter((id): id is string => Boolean(id)),
		),
	];
	const { docs: categories } = categoryIds.length
		? await payload.find({
				collection: "categories",
				where: { id: { in: categoryIds } },
				limit: 0,
				pagination: false,
				depth: 0,
				locale: options.lang,
				overrideAccess: true,
			})
		: { docs: [] };

	const productsById = new Map(products.map((p) => [String(p.id), p]));
	const categoryName = new Map(
		categories.map((c) => [String(c.id), String(c.name ?? "")]),
	);
	const lines: StockCountLine[] = variants.map((variant) => {
		const product = productsById.get(relationId(variant.product) ?? "");
		const categoryId = relationId(product?.category);
		return {
			category: (categoryId && categoryName.get(categoryId)) || t.uncategorized,
			product: String(product?.title ?? ""),
			variant: variantLabel(variant.optionValues),
			sku: variant.sku ?? null,
			barcode: (variant as { barcode?: string | null }).barcode ?? null,
			expected: variant.trackInventory
				? Number(variant.stockOnHand ?? 0)
				: null,
		};
	});

	return renderStockCountSheet({
		lang: options.lang,
		shopName: String(shop.name ?? ""),
		lines,
		blind: options.blind,
		printedAt: new Date(),
		autoprint: options.autoprint,
		embedded: options.embedded,
	});
}
