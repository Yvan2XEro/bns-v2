import { describe, expect, test } from "bun:test";
import type { OrderListEntry } from "~/types/order";
import {
	areaLabel,
	csvCell,
	isListTab,
	paymentPill,
	periodSince,
	placedWhen,
	resaleNote,
	rowAction,
	statusPill,
	toCsv,
} from "./order-list";

const NOW = new Date("2026-09-15T10:30:00.000Z");
const LATER = "2026-09-16T10:00:00.000Z";
const EARLIER = "2026-09-15T09:00:00.000Z";

function row(patch: Partial<OrderListEntry> = {}): OrderListEntry {
	return {
		id: "o-1",
		orderNumber: "BNS-1",
		status: "confirmed",
		placedAt: EARLIER,
		total: 10_000,
		itemCount: 1,
		firstItemTitle: "Galaxy A55",
		firstItemImageUrl: null,
		shopName: "Akwa",
		acceptBy: LATER,
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		hasShipment: false,
		...patch,
	};
}

describe("rowAction mirrors the order page's action table", () => {
	test("a confirmed or paid order offers accept to anyone holding orders.process", () => {
		for (const role of ["owner", "manager", "staff"] as const) {
			expect(rowAction(row(), role, NOW)).toBe("accept");
			expect(rowAction(row({ status: "paid" }), role, NOW)).toBe("accept");
		}
	});

	test("no role, no action", () => {
		expect(rowAction(row(), null, NOW)).toBeNull();
		expect(rowAction(row({ status: "accepted" }), null, NOW)).toBeNull();
	});

	test("a placed order waits for the buyer's confirmation, so the row offers nothing", () => {
		expect(rowAction(row({ status: "placed" }), "owner", NOW)).toBeNull();
	});

	test("past the accept deadline, accept is withdrawn", () => {
		expect(rowAction(row({ acceptBy: EARLIER }), "owner", NOW)).toBeNull();
		expect(rowAction(row({ acceptBy: null }), "owner", NOW)).toBe("accept");
	});

	test("an accepted order offers ship, unless a shipment owns it", () => {
		expect(rowAction(row({ status: "accepted" }), "staff", NOW)).toBe("ship");
		expect(
			rowAction(row({ status: "accepted", hasShipment: true }), "owner", NOW),
		).toBeNull();
	});

	test("later statuses offer nothing", () => {
		for (const status of [
			"shipped",
			"delivered",
			"completed",
			"cancelled",
			"delivery_failed",
		] as const) {
			expect(rowAction(row({ status }), "owner", NOW)).toBeNull();
		}
	});
});

describe("pills", () => {
	test("statuses fold into the seller's six readings", () => {
		expect(statusPill("placed")).toBe("toAccept");
		expect(statusPill("paid")).toBe("toAccept");
		expect(statusPill("accepted")).toBe("toShip");
		expect(statusPill("completed")).toBe("delivered");
		expect(statusPill("delivery_failed")).toBe("failed");
	});

	test("payment reads method then status", () => {
		expect(paymentPill(row())).toBe("cod");
		expect(paymentPill(row({ paymentStatus: "cod_collected" }))).toBe(
			"codCollected",
		);
		expect(
			paymentPill(
				row({ paymentMethod: "mobile_money", paymentStatus: "paid" }),
			),
		).toBe("paid");
		expect(
			paymentPill(
				row({
					paymentMethod: "mobile_money",
					paymentStatus: "awaiting_payment",
				}),
			),
		).toBe("awaiting");
		expect(paymentPill(row({ paymentMethod: undefined }))).toBeNull();
	});
});

describe("row text", () => {
	test("area joins what is known", () => {
		expect(areaLabel({ district: "Makepe", city: "Douala" })).toBe(
			"Makepe, Douala",
		);
		expect(areaLabel({ district: null, city: "Douala" })).toBe("Douala");
		expect(areaLabel(undefined)).toBeNull();
	});

	test("resale: pending before the purchase order, numbered after", () => {
		expect(
			resaleNote(
				row({ resale: { purchaseOrderNumber: null, supplierName: "Mboppi" } }),
			),
		).toEqual({ kind: "pending", supplier: "Mboppi" });
		expect(
			resaleNote(
				row({
					status: "shipped",
					resale: { purchaseOrderNumber: "PO-1", supplierName: "Mboppi" },
				}),
			),
		).toEqual({ kind: "sent", number: "PO-1", supplier: "Mboppi" });
		expect(resaleNote(row())).toBeNull();
	});

	test("placedWhen: minutes within the hour, then today, then a date", () => {
		expect(placedWhen("2026-09-15T10:20:00.000Z", NOW)).toEqual({
			kind: "minutes",
			minutes: 10,
		});
		expect(placedWhen("2026-09-12T10:20:00.000Z", NOW).kind).toBe("date");
	});
});

describe("filters", () => {
	test("periods resolve to a since bound, all to none", () => {
		expect(periodSince("all", NOW)).toBeUndefined();
		expect(periodSince("7d", NOW)).toBe("2026-09-08T10:30:00.000Z");
		expect(periodSince("30d", NOW)).toBe("2026-08-16T10:30:00.000Z");
		const today = periodSince("today", NOW);
		expect(today && Date.parse(today) <= NOW.getTime()).toBe(true);
	});

	test("isListTab accepts the six tabs and all", () => {
		expect(isListTab("all")).toBe(true);
		expect(isListTab("to_ship")).toBe(true);
		expect(isListTab("everything")).toBe(false);
	});
});

describe("CSV export", () => {
	test("quotes separators and defuses formulas", () => {
		expect(csvCell('Serge "M."')).toBe('"Serge ""M."""');
		expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
		expect(csvCell("-1")).toBe("'-1");
		expect(csvCell(null)).toBe("");
		expect(csvCell(170_000)).toBe("170000");
	});

	test("joins lines with CRLF", () => {
		expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\r\n1,"x,y"');
	});
});
