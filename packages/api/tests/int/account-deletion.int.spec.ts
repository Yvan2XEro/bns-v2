// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REDACTED, redactPersonalData } from "../../src/lib/redact";
import { deleteUserRelatedData } from "../../src/services/accountDeletion";
import { fakePayload } from "./helpers/fakePayload";

vi.mock("../../src/auth/oauth/providers", () => ({
	createAppleClientSecretFor: vi.fn(),
}));
vi.mock("../../src/services/notificationProvider", () => ({
	isNotificationProviderConfigured: () => false,
	getNotificationProvider: vi.fn(),
}));

const NOW = new Date("2026-09-15T10:00:00.000Z");

function world() {
	return fakePayload({
		users: [{ id: "u-1" }, { id: "u-2" }],
		listings: [{ id: "l-1", seller: "u-1", images: [] }],
		"boost-payments": [
			{
				id: "bp-1",
				listing: "l-1",
				user: "u-1",
				amount: 900,
				status: "completed",
			},
			{
				id: "bp-2",
				listing: "l-9",
				user: "u-2",
				amount: 500,
				status: "completed",
			},
		],
		"payment-intents": [
			{
				id: "pi-1",
				customer: "u-1",
				reference: "PI-pi-1",
				amount: 900,
				currency: "XAF",
				providerReference: "trx.1",
				status: "succeeded",
				statusHistory: [
					{
						status: "succeeded",
						source: "webhook",
						at: "2026-09-01T00:00:00.000Z",
					},
				],
			},
			{
				id: "pi-2",
				customer: "u-2",
				reference: "PI-pi-2",
				amount: 500,
				currency: "XAF",
				status: "succeeded",
			},
		],
		"webhook-events": [
			{
				id: "we-1",
				provider: "notchpay",
				reference: "PI-pi-1",
				payloadHash: "hash-1",
				raw: {
					id: "evt_1",
					data: {
						amount: 900,
						currency: "XAF",
						customer: {
							email: "a@example.com",
							name: "Awa",
							phone: "+237600000001",
						},
					},
				},
			},
			{
				id: "we-2",
				provider: "notchpay",
				reference: "PI-pi-2",
				payloadHash: "hash-2",
				raw: { data: { customer: { email: "b@example.com" } } },
			},
		],
		"contact-reveals": [
			{ id: "cr-1", viewer: "u-1", seller: "u-2", listing: "l-9" },
			{ id: "cr-2", viewer: "u-2", seller: "u-1", listing: "l-1" },
			{ id: "cr-3", viewer: "u-2", seller: "u-3", listing: "l-8" },
		],
	});
}

describe("redactPersonalData", () => {
	it("replaces personal keys at any depth and keeps the rest", () => {
		expect(
			redactPersonalData({
				amount: 900,
				customer: { email: "a@x", name: "A", phone: "1" },
				items: [{ customer_details: { address: "x" } }],
			}),
		).toEqual({
			amount: 900,
			customer: { email: REDACTED, name: REDACTED, phone: REDACTED },
			items: [{ customer_details: REDACTED }],
		});
	});
});

describe("deleteUserRelatedData payment retention", () => {
	let payload: ReturnType<typeof world>;

	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		payload = world();
		await deleteUserRelatedData(payload as never, { id: "u-1" });
		vi.useRealTimers();
	});

	it("keeps the boost payment without its customer", () => {
		expect(
			payload.store["boost-payments"].find((b) => b.id === "bp-1"),
		).toMatchObject({
			user: null,
			customerDeletedAt: NOW.toISOString(),
			amount: 900,
			status: "completed",
		});
	});

	it("keeps the intent and its history without its customer", () => {
		expect(
			payload.store["payment-intents"].find((i) => i.id === "pi-1"),
		).toMatchObject({
			customer: null,
			customerDeletedAt: NOW.toISOString(),
			amount: 900,
			currency: "XAF",
			providerReference: "trx.1",
			statusHistory: [{ status: "succeeded", source: "webhook" }],
		});
	});

	it("redacts the stored webhook body and keeps its hash", () => {
		const event = payload.store["webhook-events"].find((e) => e.id === "we-1");
		expect(event?.payloadHash).toBe("hash-1");
		expect(event?.raw.data).toEqual({
			amount: 900,
			currency: "XAF",
			customer: { email: REDACTED, name: REDACTED, phone: REDACTED },
		});
	});

	it("leaves other customers' records untouched", () => {
		expect(
			payload.store["payment-intents"].find((i) => i.id === "pi-2")?.customer,
		).toBe("u-2");
		expect(
			payload.store["boost-payments"].find((b) => b.id === "bp-2")?.user,
		).toBe("u-2");
		expect(
			payload.store["webhook-events"].find((e) => e.id === "we-2")?.raw.data
				.customer.email,
		).toBe("b@example.com");
	});

	it("deletes the user's contact reveals as viewer and as seller", () => {
		expect(payload.store["contact-reveals"].map((r) => r.id)).toEqual(["cr-3"]);
	});
});
