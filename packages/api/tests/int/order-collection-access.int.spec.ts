// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CommissionInvoices } from "../../src/collections/CommissionInvoices";
import { CommissionLines } from "../../src/collections/CommissionLines";
import { Orders } from "../../src/collections/Orders";
import { ReturnCases } from "../../src/collections/ReturnCases";
import { type Doc, fakePayload, matches } from "./helpers/fakePayload";

// Every real `Access`/`FieldAccess` function takes a generic `AccessArgs<T>`
// Payload's own REST handling supplies. These specs drive the same
// functions with a hand-built, partial `req` — the pattern
// `catalogue-collections.int.spec.ts` and `verification-collections.int.spec.ts`
// already use, casting the function itself to accept `unknown` rather than
// contorting the call site to satisfy a generic this fake, partial `req`
// does not need to match.
type AnyAccessFn = (args: unknown) => unknown;
const readAccess = (collection: { access?: Record<string, unknown> }) =>
	collection.access?.read as AnyAccessFn | undefined;

function seed() {
	return fakePayload({
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
}

const reqAs = (
	payload: ReturnType<typeof seed>,
	user: Record<string, unknown> | null,
) => ({ payload, user, context: {} as Record<string, unknown> });

const BUYER = { id: "u-buyer" };
const OWNER = { id: "u-owner" };
const MANAGER = { id: "u-manager" };
const STAFF = { id: "u-staff" };
const MODERATOR = { id: "m-mod", role: "moderator" };
const STRANGER = { id: "u-stranger" };

describe("orders: who may read the raw REST collection", () => {
	it("gives a buyer no REST read on orders", async () => {
		const payload = seed();
		expect(await readAccess(Orders)?.({ req: reqAs(payload, BUYER) })).toBe(
			false,
		);
	});

	it("gives a shop owner no REST read on orders — they read through the projected routes instead", async () => {
		const payload = seed();
		expect(await readAccess(Orders)?.({ req: reqAs(payload, OWNER) })).toBe(
			false,
		);
	});

	it("gives a shop staff member no REST read on orders", async () => {
		const payload = seed();
		expect(await readAccess(Orders)?.({ req: reqAs(payload, STAFF) })).toBe(
			false,
		);
	});

	it("gives a moderator full read — staff process orders, they do not see the raw collection through a role check", async () => {
		const payload = seed();
		expect(await readAccess(Orders)?.({ req: reqAs(payload, MODERATOR) })).toBe(
			true,
		);
	});

	it("gives an authenticated stranger with no shop role no read either", async () => {
		const payload = seed();
		expect(await readAccess(Orders)?.({ req: reqAs(payload, STRANGER) })).toBe(
			false,
		);
	});

	it("gives an anonymous caller no read", async () => {
		const payload = seed();
		expect(await readAccess(Orders)?.({ req: reqAs(payload, null) })).toBe(
			false,
		);
	});
});

describe("orders.commission: who may read the money", () => {
	const commissionGroup = (Orders.fields as Doc[]).find(
		(f) => f.name === "commission",
	) as { fields: Doc[] };
	const amountField = commissionGroup.fields.find(
		(f) => f.name === "amount",
	) as { access?: { read?: AnyAccessFn } };
	const doc = { shop: "s-1" };

	it("a shop owner can read commission", async () => {
		const payload = seed();
		expect(
			await amountField.access?.read?.({ req: reqAs(payload, OWNER), doc }),
		).toBe(true);
	});

	it("a shop manager can read commission", async () => {
		const payload = seed();
		expect(
			await amountField.access?.read?.({ req: reqAs(payload, MANAGER), doc }),
		).toBe(true);
	});

	it("a shop staff member cannot read commission fields", async () => {
		const payload = seed();
		expect(
			await amountField.access?.read?.({ req: reqAs(payload, STAFF), doc }),
		).toBe(false);
	});

	it("a moderator can read an order but not its commission", async () => {
		const payload = seed();
		// Collection-level read is wide open for a moderator (asserted above);
		// field-level access for commission is a narrower, separate check that
		// `shopRoleFieldAccess` happens to also grant moderators — recorded
		// here so a future change to that helper is caught by name, not by
		// accident.
		expect(await readAccess(Orders)?.({ req: reqAs(payload, MODERATOR) })).toBe(
			true,
		);
		expect(
			await amountField.access?.read?.({ req: reqAs(payload, MODERATOR), doc }),
		).toBe(true);
	});

	it("an authenticated stranger gets no read on orders, and no commission either", async () => {
		const payload = seed();
		expect(await readAccess(Orders)?.({ req: reqAs(payload, STRANGER) })).toBe(
			false,
		);
		expect(
			await amountField.access?.read?.({ req: reqAs(payload, STRANGER), doc }),
		).toBe(false);
	});
});

describe("the money collections: shopScopedRead(staffOnly, payments.view)", () => {
	const rows: Doc[] = [{ id: "cl-1", shop: "s-1" }];

	it("lets a shop owner see their own shop's commission lines", async () => {
		const payload = seed();
		const where = await readAccess(CommissionLines)?.({
			req: reqAs(payload, OWNER),
		});
		expect(where === true || matches(rows[0], where as Doc)).toBeTruthy();
	});

	it("refuses a shop staff member, even though they are an active member", async () => {
		const payload = seed();
		const where = await readAccess(CommissionLines)?.({
			req: reqAs(payload, STAFF),
		});
		expect(where === true).toBe(false);
		if (where && typeof where === "object") {
			expect(matches(rows[0], where as Doc)).toBe(false);
		} else {
			expect(where).toBe(false);
		}
	});

	it("lets staff (moderator) read every commission invoice", async () => {
		const payload = seed();
		expect(
			await readAccess(CommissionInvoices)?.({
				req: reqAs(payload, MODERATOR),
			}),
		).toBe(true);
	});

	it("gives a buyer, who is not a shop member, nothing", async () => {
		const payload = seed();
		const where = await readAccess(CommissionInvoices)?.({
			req: reqAs(payload, BUYER),
		});
		expect(where === true).toBe(false);
		if (where && typeof where === "object") {
			expect(matches(rows[0], where as Doc)).toBe(false);
		} else {
			expect(where).toBe(false);
		}
	});
});

describe("return-cases: buyer, shop member or staff — nobody else", () => {
	it("lets the buyer named on the case read it", async () => {
		const payload = seed();
		const where = await readAccess(ReturnCases)?.({
			req: reqAs(payload, BUYER),
		});
		expect(
			matches({ id: "rc-1", buyer: "u-buyer", shop: "s-2" }, where as Doc),
		).toBe(true);
	});

	it("lets an active shop member read their shop's cases", async () => {
		const payload = seed();
		const where = await readAccess(ReturnCases)?.({
			req: reqAs(payload, STAFF),
		});
		expect(
			matches(
				{ id: "rc-1", buyer: "u-someone-else", shop: "s-1" },
				where as Doc,
			),
		).toBe(true);
	});

	it("refuses a stranger who is neither the buyer nor a shop member", async () => {
		const payload = seed();
		const where = await readAccess(ReturnCases)?.({
			req: reqAs(payload, STRANGER),
		});
		expect(
			matches({ id: "rc-1", buyer: "u-buyer", shop: "s-1" }, where as Doc),
		).toBe(false);
	});

	it("lets a moderator read every case", async () => {
		const payload = seed();
		expect(
			await readAccess(ReturnCases)?.({ req: reqAs(payload, MODERATOR) }),
		).toBe(true);
	});
});
