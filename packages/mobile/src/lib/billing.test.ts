import { describe, expect, test } from "bun:test";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import type { BillingView, CommissionInvoiceView } from "../types/order";
import {
	findInvoice,
	INVOICE_LINE_KIND_KEYS,
	INVOICE_STATUS_KEYS,
	type InvoiceStatus,
	isPayable,
	isStaleInvoiceError,
	restrictionClearKey,
} from "./billing";

const STATUSES: InvoiceStatus[] = [
	"issued",
	"paid",
	"overdue",
	"waived",
	"void",
];

function invoice(
	id: string,
	status: InvoiceStatus = "issued",
): CommissionInvoiceView {
	return {
		id,
		invoiceNumber: `BNS-C-${id}`,
		periodStart: "2026-09-21T00:00:00.000Z",
		periodEnd: "2026-09-27T23:59:59.999Z",
		ordersCount: 3,
		commissionTotal: 4500,
		vatAmount: 866,
		totalDue: 5366,
		currency: "XAF",
		status,
		issuedAt: "2026-09-28T00:00:00.000Z",
		dueAt: "2026-10-05T00:00:00.000Z",
		paidAt: null,
		lines: [],
	};
}

describe("isPayable", () => {
	test("the pay button shows for issued and overdue only", () => {
		expect(STATUSES.filter(isPayable)).toEqual(["issued", "overdue"]);
	});
});

describe("INVOICE_STATUS_KEYS", () => {
	test("every status has its own billing key", () => {
		const keys = STATUSES.map((status) => INVOICE_STATUS_KEYS[status]);
		expect(new Set(keys).size).toBe(STATUSES.length);
		expect(keys.every((key) => key.startsWith("billing.status"))).toBe(true);
	});
});

/** The shape `ApiError` carries; `api.ts` itself pulls in react-native. */
describe("isStaleInvoiceError", () => {
	test("a written-off, paid or vanished invoice means the list is stale", () => {
		const codes = [
			"commission.notPayable",
			"commission.alreadyPaid",
			"commission.invoiceNotFound",
		];
		expect(
			codes.filter((code) => isStaleInvoiceError({ code, message: "refused" })),
		).toEqual(codes);
	});

	test("any other failure is not", () => {
		expect(
			isStaleInvoiceError({
				code: "payment.providerError",
				message: "down",
			}),
		).toBe(false);
		expect(isStaleInvoiceError(new Error("boom"))).toBe(false);
		expect(isStaleInvoiceError(null)).toBe(false);
	});
});

describe("restrictionClearKey", () => {
	test("a staff restriction points at support, an overdue one at the invoice", () => {
		expect(restrictionClearKey("staff")).toBe("billing.restrictedClearStaff");
		expect(restrictionClearKey("commission_overdue")).toBe(
			"billing.restrictedClearOverdue",
		);
	});
});

describe("findInvoice", () => {
	const view: BillingView = {
		invoices: [invoice("a"), invoice("b", "paid")],
		currentPeriod: {
			periodStart: "2026-09-28T00:00:00.000Z",
			periodEnd: "2026-10-04T23:59:59.999Z",
			accrued: 1200,
			ordersCount: 1,
		},
		restricted: null,
	};

	test("finds the invoice by id", () => {
		expect(findInvoice(view, "b")?.status).toBe("paid");
	});

	test("answers null for an id the view does not hold", () => {
		expect(findInvoice(view, "zzz")).toBe(null);
		expect(findInvoice(view, undefined)).toBe(null);
	});
});

describe("the computed billing keys", () => {
	test("every status, line kind and restriction key exists in both locales", () => {
		const keys = [
			...Object.values(INVOICE_STATUS_KEYS),
			...Object.values(INVOICE_LINE_KIND_KEYS),
			restrictionClearKey("staff"),
			restrictionClearKey("commission_overdue"),
		];
		const has = (locale: { billing: object }, key: string) =>
			typeof Object.getOwnPropertyDescriptor(
				locale.billing,
				key.replace(/^billing\./, ""),
			)?.value === "string";
		const missing = keys.filter((key) => !has(en, key) || !has(fr, key));
		expect(missing).toEqual([]);
		expect(keys).toHaveLength(10);
	});
});
