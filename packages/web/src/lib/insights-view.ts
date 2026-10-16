import type {
	ResponseBucket,
	ShopInsightsView,
} from "../../../api/src/types/shopInsights";
import { toCsv } from "./csv";

export type MeterTone = "ok" | "warn" | "ko";

/** At or over the threshold is red; from half of it, amber. */
export function meterTone(value: number, threshold: number): MeterTone {
	if (value >= threshold) return "ko";
	if (value >= threshold / 2) return "warn";
	return "ok";
}

/** Bar fill for a meter whose threshold mark sits at the middle. */
export function meterFill(value: number, threshold: number): number {
	if (threshold <= 0) return 0;
	return Math.min(100, Math.max(0, (value / (threshold * 2)) * 100));
}

/** Each bucket's upper bound, so a median bucket can sit on a time meter. */
export const RESPONSE_BUCKET_MINUTES: Record<ResponseBucket, number> = {
	m5: 5,
	m15: 15,
	h1: 60,
	h4: 240,
	h24: 1440,
	over24h: 2880,
};

/** "38 min", "1 h 50", "3 h" — the same shape in both languages. */
export function formatMinutes(minutes: number): string {
	const rounded = Math.max(0, Math.round(minutes));
	if (rounded < 60) return `${rounded} min`;
	const hours = Math.floor(rounded / 60);
	const rest = rounded % 60;
	return rest === 0
		? `${hours} h`
		: `${hours} h ${String(rest).padStart(2, "0")}`;
}

/** Change of the last week over the one before, or null with no base. */
export function weeklyChange(
	weekly: NonNullable<ShopInsightsView["weekly"]>,
): number | null {
	const last = weekly.at(-1);
	const before = weekly.at(-2);
	if (!last || !before || before.gmvDelivered <= 0) return null;
	return (last.gmvDelivered - before.gmvDelivered) / before.gmvDelivered;
}

export function ratio(numerator: number, denominator: number): number | null {
	return denominator > 0 ? numerator / denominator : null;
}

export interface InsightsCsvLabels {
	weekly: string;
	product: string;
	dormant: string;
	header: readonly string[];
}

/** Weekly sales, top products and dormant stock, one section per kind. */
export function insightsCsv(
	view: ShopInsightsView,
	labels: InsightsCsvLabels,
): string {
	return toCsv(labels.header, [
		...(view.weekly ?? []).map((week) => [
			labels.weekly,
			`${week.from}/${week.to}`,
			week.ordersDelivered,
			week.gmvDelivered,
			"",
			"",
		]),
		...view.topProducts.map((product) => [
			labels.product,
			product.productTitle,
			product.unitsDelivered,
			product.gmvDelivered,
			product.views,
			product.available ?? "",
		]),
		...(view.stock.dormant ?? []).map((item) => [
			labels.dormant,
			item.productTitle,
			"",
			item.costValue,
			"",
			item.available,
		]),
	]);
}

export type DormantLastSale =
	| { kind: "never" }
	| { kind: "today" }
	| { kind: "days"; days: number };

/** The server's own count of days; null when an older API sent nothing. */
export function dormantLastSale(
	item: NonNullable<ShopInsightsView["stock"]["dormant"]>[number],
): DormantLastSale | null {
	if (item.daysSinceLastSale === undefined) return null;
	if (item.daysSinceLastSale === null) return { kind: "never" };
	if (item.daysSinceLastSale < 1) return { kind: "today" };
	return { kind: "days", days: item.daysSinceLastSale };
}
