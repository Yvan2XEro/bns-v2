import type { Payload } from "payload";
import { relationId } from "../lib/relationId";
import { monthKeyFor } from "./sequences";

export const VAT_REPORT_HEADER = [
	"occurredAt",
	"kind",
	"sourceType",
	"sourceId",
	"orderNumber",
	"currency",
	"vatCollected",
	"vatReversed",
] as const;

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isVatReportMonth(value: string): boolean {
	return MONTH.test(value);
}

function csvCell(value: string | number): string {
	const text = String(value);
	return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Every `vat_payable` movement of a calendar month (Africa/Douala, the
 * invoice series' clock), one row per posting with what caused it: a
 * `charge` collects the fee's VAT, `commission_earned` the commission's, a
 * refund gives VAT back and a failed refund restores it. `month` is
 * `YYYY-MM`; `currency` narrows to one market's account.
 */
export async function vatReportCsv(
	payload: Payload,
	month: string,
	currency?: string,
): Promise<string> {
	const match = MONTH.exec(month);
	if (!match) throw new Error(`[vat-report] bad month ${month}`);
	const year = Number(match[1]);
	const monthIndex = Number(match[2]) - 1;
	const key = `${match[1].slice(2)}${match[2]}`;

	const { docs: accounts } = await payload.find({
		collection: "ledger-accounts",
		where: {
			and: [
				{ category: { equals: "vat_payable" } },
				...(currency ? [{ currency: { equals: currency } }] : []),
			],
		},
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const currencyOf = new Map(accounts.map((a) => [String(a.id), a.currency]));
	if (currencyOf.size === 0) return `${VAT_REPORT_HEADER.join(",")}\n`;

	// A day of slack either side, then the exact month by the Douala clock.
	const DAY = 86_400_000;
	const { docs: postings } = await payload.find({
		collection: "ledger-transactions",
		where: {
			and: [
				{ "entries.account": { in: [...currencyOf.keys()] } },
				{
					occurredAt: {
						greater_than_equal: new Date(
							Date.UTC(year, monthIndex, 1) - DAY,
						).toISOString(),
					},
				},
				{
					occurredAt: {
						less_than: new Date(
							Date.UTC(year, monthIndex + 1, 1) + DAY,
						).toISOString(),
					},
				},
			],
		},
		sort: "occurredAt",
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const inMonth = postings.filter(
		(p) => monthKeyFor(new Date(p.occurredAt)) === key,
	);

	const orderIds = [
		...new Set(
			inMonth.flatMap((p) => {
				const id = relationId(p.order);
				return id ? [id] : [];
			}),
		),
	];
	const { docs: orders } =
		orderIds.length > 0
			? await payload.find({
					collection: "orders",
					where: { id: { in: orderIds } },
					pagination: false,
					depth: 0,
					overrideAccess: true,
				})
			: { docs: [] };
	const numberOf = new Map(orders.map((o) => [String(o.id), o.orderNumber]));

	const rows = inMonth.flatMap((posting) =>
		posting.entries.flatMap((entry) => {
			const accountId = relationId(entry.account) ?? "";
			const rowCurrency = currencyOf.get(accountId);
			if (!rowCurrency) return [];
			return [
				[
					new Date(posting.occurredAt).toISOString(),
					posting.kind,
					posting.sourceType,
					posting.sourceId,
					numberOf.get(relationId(posting.order) ?? "") ?? "",
					rowCurrency,
					entry.credit,
					entry.debit,
				]
					.map(csvCell)
					.join(","),
			];
		}),
	);
	return `${[VAT_REPORT_HEADER.join(","), ...rows].join("\n")}\n`;
}
