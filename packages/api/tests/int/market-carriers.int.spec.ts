// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BuyerFeeInvoices } from "../../src/collections/BuyerFeeInvoices";
import { Carts } from "../../src/collections/Carts";
import { CommissionInvoices } from "../../src/collections/CommissionInvoices";
import { Markets } from "../../src/collections/Markets";
import { Orders } from "../../src/collections/Orders";
import config from "../../src/payload.config";
import { fakePayload } from "./helpers/fakePayload";
import { dataFields } from "./helpers/fields";
import { runBeforeChange } from "./helpers/runBeforeChange";

type Field = {
	name?: string;
	type?: string;
	fields?: Field[];
	relationTo?: string;
	required?: boolean;
	index?: boolean;
	defaultValue?: unknown;
	validate?: (value: unknown, options: unknown) => unknown;
	options?: Array<{ value: string }>;
};

const find = (fields: Field[], path: string): Field | undefined => {
	const [head, ...rest] = path.split(".");
	const found = (
		dataFields(fields as Parameters<typeof dataFields>[0]) as Field[]
	).find((f) => f.name === head);
	return rest.length === 0 || !found
		? found
		: find(found.fields ?? [], rest.join("."));
};

const sanitized = async (slug: string): Promise<Field[]> => {
	const resolved = await config;
	const collection = resolved.collections.find((c) => c.slug === slug);
	return (collection?.fields ?? []) as Field[];
};

const VALIDATE = {
	required: true,
	req: { t: (key: string) => key, payload: { config: {} } },
};

const SNAPSHOT_KEYS = [
	"locale",
	"symbol",
	"position",
	"groupSeparator",
	"decimalSeparator",
	"minorUnit",
];

describe("orders carry their market", () => {
	it("links the market, indexed and not client-required", () => {
		const market = find(Orders.fields as Field[], "market");
		expect(market).toMatchObject({
			type: "relationship",
			relationTo: "markets",
			index: true,
		});
		expect(market?.required).not.toBe(true);
	});

	it("has no silent XAF currency: the schema refuses a missing one", async () => {
		const currency = find(await sanitized("orders"), "amounts.currency");
		expect(currency?.defaultValue).toBeUndefined();
		expect(currency?.required).toBe(true);
		expect(currency?.validate?.(undefined, VALIDATE)).not.toBe(true);
		expect(currency?.validate?.("XAF", VALIDATE)).toBe(true);
	});

	it("the market currency guard queries a field the real Orders collection has", async () => {
		const orders = await sanitized("orders");
		const market = find(orders, "market");
		const status = find(orders, "status");
		const stored = {
			id: "m1",
			countryCode: "CM",
			name: "Cameroun",
			status: "live",
			currency: { code: "XAF", minorUnit: 0, rounding: "half_up" },
			regulatoryReview: { evidence: "ev1" },
			payments: { provider: "notchpay", settlementMode: "provider_split" },
			timezone: "Africa/Douala",
		};
		const seed = {
			markets: [{ id: "m1", countryCode: "CM" }],
			"market-cities": [{ id: "c1", market: "m1", active: true }],
			orders: [{ id: "o1", [market?.name ?? "?"]: "m1", status: "placed" }],
		};
		expect(market?.relationTo).toBe("markets");
		expect(status?.name).toBe("status");
		await expect(
			runBeforeChange(Markets, {
				data: { currency: { code: "GNF", minorUnit: 0, rounding: "half_up" } },
				originalDoc: stored,
				operation: "update",
				req: { payload: fakePayload(seed) },
			}),
		).rejects.toThrow(
			"The currency cannot change while orders in this market are still open.",
		);
	});
});

describe("carts carry their market", () => {
	it("links the market", () => {
		expect(find(Carts.fields as Field[], "market")).toMatchObject({
			type: "relationship",
			relationTo: "markets",
		});
	});
});

describe.each([
	["commission-invoices", CommissionInvoices],
	["buyer-fee-invoices", BuyerFeeInvoices],
])("%s", (slug, collection) => {
	it("requires a currency with no default", async () => {
		const currency = find(await sanitized(slug), "currency");
		expect(currency?.defaultValue).toBeUndefined();
		expect(currency?.required).toBe(true);
	});

	it("snapshots exactly the MoneyFormat fields", () => {
		const snapshot = find(collection.fields as Field[], "formatSnapshot");
		expect(snapshot?.type).toBe("array");
		expect(
			(snapshot?.fields ?? []).map((f) => f.name).filter((n) => n !== "id"),
		).toEqual(SNAPSHOT_KEYS);
		const locale = find(snapshot?.fields ?? [], "locale");
		expect(locale?.options?.map((o) => o.value)).toEqual(["fr", "en"]);
	});
});
