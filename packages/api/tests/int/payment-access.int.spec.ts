// @vitest-environment node
import { describe, expect, it } from "vitest";
import { selfOrStaffField } from "../../src/access/staff";
import { BoostPayments } from "../../src/collections/BoostPayments";
import { PaymentIntents } from "../../src/collections/PaymentIntents";
import { WebhookEvents } from "../../src/collections/WebhookEvents";

const USER = { id: "u-1", role: "user" };
const MOD = { id: "m-1", role: "moderator" };
const ADMIN = { id: "a-1", role: "admin" };
const run = (fn: any, user: unknown, extra: Record<string, unknown> = {}) =>
	fn({ req: { user }, ...extra });

describe("payment-intents access", () => {
	it("shows a customer only their own intents", () => {
		expect(run(PaymentIntents.access?.read, USER)).toEqual({
			customer: { equals: "u-1" },
		});
	});

	it("lets staff read every intent and hides them from guests", () => {
		expect(run(PaymentIntents.access?.read, MOD)).toBe(true);
		expect(run(PaymentIntents.access?.read, null)).toBe(false);
	});

	it.each([
		"create",
		"update",
		"delete",
	] as const)("closes %s even to admins", (operation) => {
		expect(run(PaymentIntents.access?.[operation], ADMIN)).toBe(false);
	});
});

describe("webhook-events access", () => {
	it("is readable by staff only", () => {
		expect(run(WebhookEvents.access?.read, USER)).toBe(false);
		expect(run(WebhookEvents.access?.read, MOD)).toBe(true);
	});

	it("is unique per provider event", () => {
		expect(WebhookEvents.indexes).toContainEqual({
			fields: ["provider", "providerEventId"],
			unique: true,
		});
	});
});

describe("boost-payments access", () => {
	it("no longer lets any signed-in user create a record", () => {
		expect(run(BoostPayments.access?.create, USER)).toBe(false);
		expect(run(BoostPayments.access?.create, ADMIN)).toBe(false);
	});
});

describe("selfOrStaffField", () => {
	it("lets a user read their own field", () => {
		expect(run(selfOrStaffField, USER, { id: "u-1" })).toBe(true);
		expect(run(selfOrStaffField, USER, { doc: { id: "u-1" } })).toBe(true);
	});

	it("hides it from anyone else except staff", () => {
		expect(run(selfOrStaffField, USER, { id: "u-2" })).toBe(false);
		expect(run(selfOrStaffField, null, { id: "u-2" })).toBe(false);
		expect(run(selfOrStaffField, MOD, { id: "u-2" })).toBe(true);
	});
});
