// @vitest-environment node
import { describe, expect, it } from "vitest";
import { staffOnly } from "../../src/access/staff";
import { BuyerPhoneScores } from "../../src/collections/BuyerPhoneScores";
import { CART_STATUSES, Carts } from "../../src/collections/Carts";
import { CommissionInvoices } from "../../src/collections/CommissionInvoices";
import {
	COMMISSION_LINE_KINDS,
	CommissionLines,
} from "../../src/collections/CommissionLines";
import { OrderEvents } from "../../src/collections/OrderEvents";
import {
	ORDER_ITEM_FULFILLMENT_STATUSES,
	OrderItems,
} from "../../src/collections/OrderItems";
import {
	ORDER_PAYMENT_STATUSES,
	ORDER_STATUSES,
	Orders,
} from "../../src/collections/Orders";
import {
	RETURN_CASE_STATUSES,
	ReturnCases,
} from "../../src/collections/ReturnCases";
import config from "../../src/payload.config";
import { fakePayload } from "./helpers/fakePayload";

type FieldAccessFn = (args: unknown) => unknown;
type AccessFn = (args: unknown) => unknown;

/**
 * Every real `Access`/`FieldAccess` function takes `AccessArgs<T>`, a
 * generic Payload shape full REST handling supplies. These specs drive the
 * same functions with a hand-built, partial `req` — the pattern
 * `catalogue-collections.int.spec.ts` and `verification-collections.int.spec.ts`
 * already use, casting the function itself rather than contorting the call
 * site to satisfy a generic this test does not need to exercise.
 */
const accessFn = (
	collection: { access?: Record<string, unknown> },
	op: "read" | "create" | "update" | "delete",
): AccessFn | undefined => collection.access?.[op] as AccessFn | undefined;

type Field = {
	name?: string;
	type?: string;
	fields?: Field[];
	maxRows?: number;
	min?: number;
	max?: number;
	defaultValue?: unknown;
	access?: {
		read?: FieldAccessFn;
		create?: FieldAccessFn;
		update?: FieldAccessFn;
	};
	options?: Array<{ label: string; value: string }>;
};

function field(fields: Field[], path: string): Field | undefined {
	const [head, ...rest] = path.split(".");
	const found = fields.find((f) => f.name === head);
	if (!found) return undefined;
	if (rest.length === 0) return found;
	return field(found.fields ?? [], rest.join("."));
}

const optionValues = (f: Field | undefined): string[] =>
	(f?.options ?? []).map((o) => o.value);

const OWNER = { req: { user: { id: "u-owner" } } };
const MODERATOR = { req: { user: { id: "m-1", role: "moderator" } } };

describe("every P4 collection is registered", () => {
	it("appears in payload.config.ts's collections array", async () => {
		const payloadConfig = await config;
		const slugs = payloadConfig.collections.map((c) => c.slug);
		for (const slug of [
			"carts",
			"orders",
			"order-items",
			"order-events",
			"buyer-phone-scores",
			"commission-lines",
			"commission-invoices",
			"return-cases",
			"sequences",
		]) {
			expect(slugs).toContain(slug);
		}
	});
});

describe("orders field shape", () => {
	it("offers exactly the eleven statuses, in the spec's order", () => {
		expect(optionValues(field(Orders.fields as Field[], "status"))).toEqual([
			...ORDER_STATUSES,
		]);
		expect(ORDER_STATUSES).toEqual([
			"placed",
			"confirmed",
			"paid",
			"accepted",
			"shipped",
			"delivered",
			"completed",
			"cancelled",
			"delivery_failed",
			"returned",
			"disputed",
		]);
	});

	it("offers exactly the nine payment statuses", () => {
		expect(
			optionValues(field(Orders.fields as Field[], "paymentStatus")),
		).toEqual([...ORDER_PAYMENT_STATUSES]);
		expect(ORDER_PAYMENT_STATUSES).toHaveLength(9);
	});

	it("closes both codeHash fields to read, from anyone", () => {
		const confirmationCodeHash = field(
			Orders.fields as Field[],
			"confirmation.codeHash",
		);
		const handoverCodeHash = field(
			Orders.fields as Field[],
			"handover.codeHash",
		);
		expect(confirmationCodeHash?.access?.read?.({})).toBe(false);
		expect(handoverCodeHash?.access?.read?.({})).toBe(false);
	});

	it("gates every commission field to payments.view, not plain membership", async () => {
		const amount = field(Orders.fields as Field[], "commission.amount");
		const rateBps = field(Orders.fields as Field[], "commission.rateBps");
		const line = field(Orders.fields as Field[], "commission.line");
		const doc = { shop: "s-1" };

		const payload = fakePayload({
			shops: [{ id: "s-1", status: "active", owner: "u-owner", level: 2 }],
			"shop-members": [
				{
					id: "m-1",
					shop: "s-1",
					user: "u-owner",
					role: "owner",
					status: "active",
				},
				{
					id: "m-2",
					shop: "s-1",
					user: "u-manager",
					role: "manager",
					status: "active",
				},
				{
					id: "m-3",
					shop: "s-1",
					user: "u-staff",
					role: "staff",
					status: "active",
				},
			],
		});
		const reqFor = (userId: string | null) => ({
			payload,
			user: userId ? { id: userId } : null,
			context: {},
		});

		for (const leaf of [amount, rateBps, line]) {
			expect(await leaf?.access?.read?.({ req: reqFor("u-owner"), doc })).toBe(
				true,
			);
			expect(
				await leaf?.access?.read?.({ req: reqFor("u-manager"), doc }),
			).toBe(true);
			expect(await leaf?.access?.read?.({ req: reqFor("u-staff"), doc })).toBe(
				false,
			);
			expect(
				await leaf?.access?.read?.({ req: reqFor("u-stranger"), doc }),
			).toBe(false);
			expect(await leaf?.access?.read?.({ req: reqFor(null), doc })).toBe(
				false,
			);
		}
	});

	it("REST read is staff-only; create, update and delete are closed", () => {
		expect(Orders.access?.read).toBe(staffOnly);
		expect(accessFn(Orders, "create")?.(OWNER)).toBe(false);
		expect(accessFn(Orders, "update")?.(OWNER)).toBe(false);
		expect(accessFn(Orders, "delete")?.(MODERATOR)).toBe(false);
	});

	it("pins status and paymentStatus on a REST update unless the order service wrote it", async () => {
		const hook = (
			Orders.hooks?.beforeChange as Array<
				(args: Record<string, unknown>) => Promise<Record<string, unknown>>
			>
		)[0];
		const originalDoc = { status: "placed", paymentStatus: "cod_pending" };
		const result = await hook({
			operation: "update",
			originalDoc,
			data: { status: "delivered", paymentStatus: "cod_collected" },
			req: { context: {} },
		});
		expect(result.status).toBe("placed");
		expect(result.paymentStatus).toBe("cod_pending");

		const serviceResult = await hook({
			operation: "update",
			originalDoc,
			data: { status: "delivered", paymentStatus: "cod_collected" },
			req: { context: { orderService: true } },
		});
		expect(serviceResult.status).toBe("delivered");
		expect(serviceResult.paymentStatus).toBe("cod_collected");
	});
});

describe("order-items field shape", () => {
	it("offers exactly the seven fulfillment statuses", () => {
		expect(
			optionValues(field(OrderItems.fields as Field[], "fulfillmentStatus")),
		).toEqual([...ORDER_ITEM_FULFILLMENT_STATUSES]);
		expect(ORDER_ITEM_FULFILLMENT_STATUSES).toHaveLength(7);
	});

	it("REST access is identical to orders: staff-only read, no writes", () => {
		expect(OrderItems.access?.read).toBe(staffOnly);
		expect(accessFn(OrderItems, "create")?.(OWNER)).toBe(false);
		expect(accessFn(OrderItems, "update")?.(OWNER)).toBe(false);
		expect(accessFn(OrderItems, "delete")?.(OWNER)).toBe(false);
	});

	it("pins fulfillmentStatus and snapshot on update unless the order service wrote it", async () => {
		const hooks = OrderItems.hooks?.beforeChange as Array<
			(args: Record<string, unknown>) => Promise<Record<string, unknown>>
		>;
		const pin = hooks[hooks.length - 1];
		const originalDoc = {
			fulfillmentStatus: "unfulfilled",
			snapshot: { title: "Original" },
		};
		const result = await pin({
			operation: "update",
			originalDoc,
			data: {
				fulfillmentStatus: "delivered",
				snapshot: { title: "Attacker" },
			},
			req: { context: {} },
		});
		expect(result.fulfillmentStatus).toBe("unfulfilled");
		expect(result.snapshot).toEqual({ title: "Original" });
	});
});

describe("order-events: append-only", () => {
	it("closes create, update and delete to everyone", () => {
		expect(accessFn(OrderEvents, "create")?.(OWNER)).toBe(false);
		expect(accessFn(OrderEvents, "update")?.(MODERATOR)).toBe(false);
		expect(accessFn(OrderEvents, "delete")?.(MODERATOR)).toBe(false);
	});

	it("has no update hook at all", () => {
		// `payload.config.ts` sanitizes every collection on import (even just
		// for the registration check above), which backfills `hooks` with
		// empty arrays — so the absence this test pins is "no hook logic was
		// added", checked by length rather than by the key's presence.
		expect(OrderEvents.hooks?.beforeChange ?? []).toHaveLength(0);
		expect(OrderEvents.hooks?.afterChange ?? []).toHaveLength(0);
	});
});

describe("carts field shape", () => {
	it("caps items at 30 rows and items.quantity at 1-20", () => {
		const items = field(Carts.fields as Field[], "items");
		expect(items?.maxRows).toBe(30);
		const quantity = field(Carts.fields as Field[], "items.quantity");
		expect(quantity?.min).toBe(1);
		expect(quantity?.max).toBe(20);
	});

	it("closes every REST operation, including read", () => {
		expect(accessFn(Carts, "read")?.(OWNER)).toBe(false);
		expect(accessFn(Carts, "create")?.(OWNER)).toBe(false);
		expect(accessFn(Carts, "update")?.(OWNER)).toBe(false);
		expect(accessFn(Carts, "delete")?.(OWNER)).toBe(false);
	});

	it("declares the three cart statuses", () => {
		expect(CART_STATUSES).toEqual(["active", "converted", "abandoned"]);
	});
});

describe("commission-lines field shape", () => {
	it("amount has min: 1", () => {
		const amount = field(CommissionLines.fields as Field[], "amount");
		expect(amount?.min).toBe(1);
	});

	it("kind offers charge, credit and carry_over as the P4/P6 kinds", () => {
		// The spec's data-model table names one further P8 kind
		// (`resale_margin`); it is declared here, reserved, alongside the three
		// P4/P6 writes, giving four options total.
		expect(
			optionValues(field(CommissionLines.fields as Field[], "kind")),
		).toEqual([...COMMISSION_LINE_KINDS]);
		expect(COMMISSION_LINE_KINDS).toEqual([
			"charge",
			"credit",
			"carry_over",
			"resale_margin",
		]);
	});
});

describe("commission-invoices and commission-lines: money collections", () => {
	it("are closed to direct REST writes", () => {
		expect(accessFn(CommissionLines, "create")?.(OWNER)).toBe(false);
		expect(accessFn(CommissionInvoices, "update")?.(OWNER)).toBe(false);
	});
});

describe("return-cases field shape", () => {
	it("offers P6's full state machine, with requested as the only value P4 writes", () => {
		const status = field(ReturnCases.fields as Field[], "status");
		expect(optionValues(status)).toEqual([...RETURN_CASE_STATUSES]);
		expect(status?.defaultValue).toBe("requested");
	});
});

describe("buyer-phone-scores field shape", () => {
	it("read is staff-only", () => {
		expect(BuyerPhoneScores.access?.read).toBe(staffOnly);
	});

	it("holds no phone field — only phoneHash", () => {
		const names = (BuyerPhoneScores.fields as Field[]).map((f) => f.name);
		expect(names).toContain("phoneHash");
		expect(names).not.toContain("phone");
	});
});
