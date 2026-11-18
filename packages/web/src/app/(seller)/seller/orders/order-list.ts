import {
	ORDER_ACTION_PERMISSIONS,
	ORDER_ACTIONS_BY_STATUS,
} from "~/lib/order-actions";
import type { OrderStatusName, ShopOrderTab } from "~/lib/order-status";
import { can } from "~/lib/shop-roles";
import type { ShopRole } from "~/types";
import type { OrderListEntry } from "~/types/order";

/**
 * The order list's row-level decisions, as pure functions so `bun test` can
 * pin them. Every one of them only decides what to offer; the server still
 * judges each transition and each permission when the button is pressed.
 */

export type ListTab = ShopOrderTab | "all";

export function isListTab(value: unknown): value is ListTab {
	return (
		value === "all" ||
		value === "to_accept" ||
		value === "to_ship" ||
		value === "shipped" ||
		value === "delivered" ||
		value === "cancelled" ||
		value === "failed"
	);
}

export const PERIODS = ["all", "today", "7d", "30d"] as const;
export type Period = (typeof PERIODS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** `since` for the API: local midnight for "today", a rolling window otherwise. */
export function periodSince(period: Period, now: Date): string | undefined {
	switch (period) {
		case "all":
			return undefined;
		case "today": {
			const midnight = new Date(now);
			midnight.setHours(0, 0, 0, 0);
			return midnight.toISOString();
		}
		case "7d":
			return new Date(now.getTime() - 7 * DAY_MS).toISOString();
		case "30d":
			return new Date(now.getTime() - 30 * DAY_MS).toISOString();
	}
}

export type RowAction = "accept" | "ship";

function offered(
	row: Pick<OrderListEntry, "status">,
	action: "accept" | "ship" | "decline",
	role: ShopRole | null,
): boolean {
	const permission = ORDER_ACTION_PERMISSIONS[action];
	return (
		ORDER_ACTIONS_BY_STATUS[row.status].shop.includes(action) &&
		(!permission || can(role, permission))
	);
}

/**
 * The one quick action a row offers: the same table and permission matrix
 * the order page's action bar reads. Shipping an order that already has a
 * shipment belongs to the order page's shipment panel, so the row offers
 * nothing there; neither does an order still waiting for the buyer's
 * confirmation, which needs the call the order page explains.
 */
export function rowAction(
	row: Pick<OrderListEntry, "status" | "acceptBy" | "hasShipment">,
	role: ShopRole | null,
	now: Date,
): RowAction | null {
	if (offered(row, "accept", role)) {
		const deadline = row.acceptBy ? Date.parse(row.acceptBy) : Number.NaN;
		if (!Number.isFinite(deadline) || now.getTime() <= deadline) {
			return "accept";
		}
		return null;
	}
	if (offered(row, "ship", role) && !row.hasShipment) return "ship";
	return null;
}

/** The selected orders that can still be accepted: a refresh may have cancelled one or run out its deadline. */
export function acceptableSelection(
	rows: ReadonlyArray<
		Pick<OrderListEntry, "id" | "status" | "acceptBy" | "hasShipment">
	>,
	selected: ReadonlySet<string>,
	role: ShopRole | null,
	now: Date,
): string[] {
	return rows
		.filter(
			(row) => selected.has(row.id) && rowAction(row, role, now) === "accept",
		)
		.map((row) => row.id);
}

/**
 * A row the shop may still decline: `DECLINABLE_STATUSES` (placed, confirmed,
 * paid) with `orders.process`. Declining has no deadline, so a placed order
 * or one past its acceptance clock can still be refused.
 */
export function isRefusable(
	row: Pick<OrderListEntry, "status">,
	role: ShopRole | null,
): boolean {
	return offered(row, "decline", role);
}

type SelectableRow = Pick<
	OrderListEntry,
	"id" | "status" | "acceptBy" | "hasShipment"
>;

/** A row gets a checkbox when the selection bar can do something with it. */
export function isSelectable(
	row: SelectableRow,
	role: ShopRole | null,
	now: Date,
): boolean {
	return rowAction(row, role, now) === "accept" || isRefusable(row, role);
}

export function selectableSelection(
	rows: ReadonlyArray<SelectableRow>,
	selected: ReadonlySet<string>,
	role: ShopRole | null,
	now: Date,
): string[] {
	return rows
		.filter((row) => selected.has(row.id) && isSelectable(row, role, now))
		.map((row) => row.id);
}

export function refusableSelection(
	rows: ReadonlyArray<SelectableRow>,
	selected: ReadonlySet<string>,
	role: ShopRole | null,
): string[] {
	return rows
		.filter((row) => selected.has(row.id) && isRefusable(row, role))
		.map((row) => row.id);
}

export interface BulkOutcome {
	done: number;
	failures: unknown[];
	/** The orders that failed, to retry those alone. */
	failedIds: string[];
}

/**
 * One request per order, in sequence: each order goes through its own route
 * so the server judges every transition and permission, and one failure
 * never stops the rest.
 */
export async function runOneByOne(
	ids: readonly string[],
	run: (id: string) => Promise<unknown>,
	/** Called after each order, so twenty orders on 3G show "7/20", not a frozen button. */
	onProgress?: (finished: number, total: number) => void,
): Promise<BulkOutcome> {
	const failures: unknown[] = [];
	const failedIds: string[] = [];
	let finished = 0;
	for (const id of ids) {
		try {
			await run(id);
		} catch (error) {
			failures.push(error);
			failedIds.push(id);
		}
		finished += 1;
		onProgress?.(finished, ids.length);
	}
	return { done: ids.length - failures.length, failures, failedIds };
}

export interface ItemLines {
	lines: { title: string; quantity: number }[];
	/** Lines not shown. */
	more: number;
}

/** "title ×2" per line; null when the API did not send lines. */
export function itemLines(
	row: Pick<OrderListEntry, "lines" | "lineCount">,
	shown = 2,
): ItemLines | null {
	if (!row.lines || row.lines.length === 0) return null;
	const lines = row.lines.slice(0, shown);
	const total = Math.max(row.lineCount ?? row.lines.length, row.lines.length);
	return { lines, more: total - lines.length };
}

export type StatusPill =
	| "toAccept"
	| "toShip"
	| "shipped"
	| "delivered"
	| "cancelled"
	| "failed"
	| "returned"
	| "disputed";

const STATUS_PILLS: Record<OrderStatusName, StatusPill> = {
	placed: "toAccept",
	confirmed: "toAccept",
	paid: "toAccept",
	accepted: "toShip",
	shipped: "shipped",
	delivered: "delivered",
	completed: "delivered",
	cancelled: "cancelled",
	delivery_failed: "failed",
	returned: "returned",
	disputed: "disputed",
};

export function statusPill(status: OrderStatusName): StatusPill {
	return STATUS_PILLS[status];
}

export const STATUS_PILL_TONES: Record<StatusPill, string> = {
	toAccept: "bg-[#FEF3C7] text-[#92400E]",
	toShip: "bg-[#DBEAFE] text-[#1E40AF]",
	shipped: "bg-[#E0E7FF] text-[#3730A3]",
	delivered: "bg-[#DCFCE7] text-[#166534]",
	cancelled: "bg-[#F1F5F9] text-[#475569]",
	failed: "bg-[#FEE2E2] text-[#B91C1C]",
	returned: "bg-[#F1F5F9] text-[#475569]",
	disputed: "bg-[#FEE2E2] text-[#B91C1C]",
};

export {
	type PaymentPill,
	paymentPill,
} from "../../../../../../api/src/contracts/orderPayment";

/** "Makepe, Douala"; whichever half is known, or null. */
export function areaLabel(area: OrderListEntry["area"]): string | null {
	const parts = [area?.district, area?.city].filter(Boolean);
	return parts.length ? parts.join(", ") : null;
}

export type ResaleNote =
	| { kind: "pending"; supplier: string }
	| { kind: "sent"; number: string; supplier: string | null }
	| { kind: "plain"; supplier: string | null };

/** What the resale mention on a row says, before and after the purchase order is sent. */
export function resaleNote(
	row: Pick<OrderListEntry, "resale" | "status">,
): ResaleNote | null {
	const resale = row.resale;
	if (!resale) return null;
	if (resale.purchaseOrderNumber) {
		return {
			kind: "sent",
			number: resale.purchaseOrderNumber,
			supplier: resale.supplierName,
		};
	}
	if (statusPill(row.status) === "toAccept" && resale.supplierName) {
		return { kind: "pending", supplier: resale.supplierName };
	}
	return { kind: "plain", supplier: resale.supplierName };
}

export type PlacedWhen =
	| { kind: "minutes"; minutes: number }
	| { kind: "today"; at: Date }
	| { kind: "date"; at: Date };

/** "il y a 10 min" within the hour, "aujourd'hui 10:05" the same day, a date otherwise. */
export function placedWhen(placedAt: string, now: Date): PlacedWhen {
	const at = new Date(placedAt);
	const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
	if (minutes >= 0 && minutes < 60) {
		return { kind: "minutes", minutes: Math.max(1, minutes) };
	}
	if (at.toDateString() === now.toDateString()) return { kind: "today", at };
	return { kind: "date", at };
}

/**
 * A spreadsheet opens a cell that starts with `=`, `+`, `-` or `@` as a
 * formula; a recipient name is buyer input, so such a cell is quoted as text.
 */
export function csvCell(value: string | number | null | undefined): string {
	let text = value === null || value === undefined ? "" : String(value);
	if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
	return /[",\n\r;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(
	header: readonly string[],
	rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
	return [header, ...rows]
		.map((line) => line.map(csvCell).join(","))
		.join("\r\n");
}
