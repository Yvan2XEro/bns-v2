import type { ShopRole } from "../types/api";

export interface ProductOption {
	name: string;
	values: string[];
}

export function generateCombinations(
	options: ProductOption[],
): Record<string, string>[] {
	let combos: Record<string, string>[] = [{}];
	for (const option of options) {
		const name = option.name.trim();
		const values = option.values.map((v) => v.trim()).filter(Boolean);
		if (!name || values.length === 0) continue;
		combos = combos.flatMap((combo) =>
			values.map((value) => ({ ...combo, [name]: value })),
		);
	}
	return combos;
}

export function variantKey(values: Record<string, string>): string {
	return Object.keys(values)
		.sort()
		.map((k) => `${k}=${values[k]}`)
		.join("|");
}

export function variantLabel(
	values: Record<string, string>,
	options?: ProductOption[],
): string {
	const order = options?.map((o) => o.name) ?? Object.keys(values);
	const extra = Object.keys(values).filter((k) => !order.includes(k));
	return [...order, ...extra]
		.map((name) => values[name])
		.filter(Boolean)
		.join(" · ");
}

/**
 * Mirrors `marginPercent` in `packages/api/src/lib/variants.ts`: null only
 * when the price is missing/zero or the cost is missing — a zero or negative
 * cost still produces a (100%+) margin, same as the server.
 */
export function marginPercent(
	price: number | null,
	cost: number | null,
): number | null {
	if (price === null || !(price > 0)) return null;
	if (cost === null || cost === undefined) return null;
	return Math.round(((price - cost) / price) * 1000) / 10;
}

export function priceRange(
	prices: number[],
): { min: number; max: number } | null {
	if (prices.length === 0) return null;
	return { min: Math.min(...prices), max: Math.max(...prices) };
}

function group(amount: number, lang?: string): string {
	const separator = lang?.startsWith("en") ? "," : " ";
	const sign = amount < 0 ? "−" : "";
	const digits = Math.abs(Math.round(amount)).toString();
	return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/** Hermes' Intl output differs by platform; grouping by hand keeps it stable. */
export function formatXaf(amount: number, lang?: string): string {
	return `${group(amount, lang)} XAF`;
}

export function formatXafRange(
	min: number,
	max: number,
	lang?: string,
): string {
	if (min === max) return formatXaf(min, lang);
	return `${group(min, lang)} – ${group(max, lang)} XAF`;
}

export function formatPercent(value: number, lang?: string): string {
	const text = value.toFixed(1);
	return `${lang?.startsWith("en") ? text : text.replace(".", ",")} %`;
}

/**
 * Mirrors `canManageShop` in `packages/api/src/access/shopRoles.ts`: only an
 * owner or manager may see purchase cost. Screens must gate cost display on
 * this — never on whether a `cost` value happens to be present, since a role
 * that cannot see it never receives the field at all.
 */
export function canManageShop(role: ShopRole | null | undefined): boolean {
	return role === "owner" || role === "manager";
}
