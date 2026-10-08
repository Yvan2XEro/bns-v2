// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expirePickupHolds } from "../../src/jobs/expirePickupHolds";
import { expireRiderLinks } from "../../src/jobs/expireRiderLinks";
import { finalizeFailedShipments } from "../../src/jobs/finalizeFailedShipments";
import { flagLateShipments } from "../../src/jobs/flagLateShipments";
import { pollCourierShipments } from "../../src/jobs/pollCourierShipments";
import { purgeDeliveryProofs } from "../../src/jobs/purgeDeliveryProofs";
import { remindReturns } from "../../src/jobs/remindReturns";
import { getCourierProvider } from "../../src/lib/delivery";
import { FakeCourierProvider } from "../../src/lib/delivery/fakeCourier";
import { proofRetentionGuards } from "../../src/services/delivery/proofRetention";
import { fakePayload } from "./helpers/fakePayload";

const triggerNotificationEvent = vi.fn();
vi.mock("../../src/hooks/notificationEvents", () => ({
	triggerNotificationEvent: (...args: unknown[]) =>
		triggerNotificationEvent(...args),
}));
vi.mock("../../src/services/smsProvider", () => ({ sendSms: vi.fn() }));
vi.mock("../../src/services/orders/risk", () => ({
	recordDelivered: vi.fn(async () => undefined),
	recordRefusal: vi.fn(async () => undefined),
}));

const NOW = new Date("2026-10-10T12:00:00.000Z");
const iso = (offsetMs: number) =>
	new Date(NOW.getTime() + offsetMs).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const order = {
	id: "order-1",
	orderNumber: "ORD-1",
	shop: "shop-1",
	buyer: "buyer-1",
	status: "shipped",
	paymentMethod: "mobile_money",
	paymentStatus: "paid",
	amounts: { total: 20000 },
	delivery: { phone: "+237600000099", recipientName: "Aicha", city: "douala" },
	handover: {},
	timestamps: {},
	deadlines: {},
};

function shipment(overrides: Record<string, unknown> = {}) {
	return {
		id: "shipment-1",
		shipmentNumber: "SHP-1",
		order: "order-1",
		storefrontShop: "shop-1",
		fulfillingShop: "shop-1",
		method: "seller_delivery",
		carrier: "self",
		origin: null,
		destination: { city: "douala" },
		fee: 1500,
		status: "failed",
		...overrides,
	};
}

function seeded(
	shipments: Record<string, unknown>[],
	extra: Record<string, Record<string, unknown>[]> = {},
) {
	return fakePayload({
		users: [
			{ id: "buyer-1", role: "user" },
			{ id: "seller-1", role: "user" },
		],
		shops: [{ id: "shop-1", name: "Shop", owner: "seller-1" }],
		"shop-members": [
			{
				id: "member-1",
				shop: "shop-1",
				user: "seller-1",
				role: "owner",
				status: "active",
			},
		],
		orders: [{ ...order }],
		"order-items": [
			{
				id: "item-1",
				order: "order-1",
				product: "product-1",
				variant: "variant-1",
				fulfillingShop: "shop-1",
				unitPrice: 20000,
				quantity: 1,
				stockTracked: true,
				fulfillmentStatus: "shipped",
			},
		],
		products: [{ id: "product-1", shop: "shop-1", title: "Phone" }],
		"product-variants": [
			{
				id: "variant-1",
				product: "product-1",
				shop: "shop-1",
				price: 20000,
				trackInventory: true,
				stockOnHand: 5,
				stockReserved: 1,
			},
		],
		"stock-movements": [],
		shipments,
		...extra,
	});
}

beforeEach(() => {
	triggerNotificationEvent.mockClear();
});
afterEach(() => {
	vi.unstubAllEnvs();
});

describe("finalizeFailedShipments", () => {
	const due = (overrides: Record<string, unknown> = {}) =>
		shipment({
			attempts: [
				{ number: 1, outcome: "failed", reason: "absent", at: iso(-3 * DAY) },
			],
			redelivery: { rescheduleBy: iso(-1000) },
			...overrides,
		});

	it("finalizes a failed shipment past rescheduleBy and starts the return", async () => {
		const payload = seeded([due()]);
		const done = await finalizeFailedShipments(payload, NOW);
		expect(done).toEqual(["shipment-1"]);
		expect(payload.store.shipments?.[0]).toMatchObject({
			status: "failed",
			finalFailure: { reason: "absent" },
			failureCostBearer: "shop",
		});
		expect(payload.store.shipments?.[0]).toMatchObject({
			finalFailure: { at: expect.any(String) },
		});
		expect(triggerNotificationEvent).toHaveBeenCalledWith(
			expect.objectContaining({ event: "shipment-return-initiated" }),
		);
	});

	it("is idempotent across reruns", async () => {
		const payload = seeded([due()]);
		await finalizeFailedShipments(payload, NOW);
		const again = await finalizeFailedShipments(payload, NOW);
		expect(again).toEqual([]);
		expect(
			payload.store["shipment-events"]?.filter(
				(event) => event.type === "shipment.return_initiated",
			),
		).toHaveLength(1);
	});

	it("leaves a shipment whose window is still open, and closes it at the exact deadline", async () => {
		const open = seeded([due({ redelivery: { rescheduleBy: iso(1000) } })]);
		expect(await finalizeFailedShipments(open, NOW)).toEqual([]);
		expect(open.store.shipments?.[0]?.finalFailure).toBeUndefined();

		const exact = seeded([due({ redelivery: { rescheduleBy: iso(0) } })]);
		expect(await finalizeFailedShipments(exact, NOW)).toEqual(["shipment-1"]);
	});

	it("respects a redelivery still scheduled ahead", async () => {
		const payload = seeded([
			due({ redelivery: { rescheduleBy: iso(-1000), scheduledFor: iso(DAY) } }),
		]);
		expect(await finalizeFailedShipments(payload, NOW)).toEqual([]);
	});

	it("skips a shipment rescued between the query and its transaction", async () => {
		const payload = seeded([due()]);
		payload.failWhen = (method, args) => {
			const row = payload.store.shipments?.[0];
			if (method === "findByID" && args.collection === "shipments" && row) {
				row.status = "in_transit";
			}
			return false;
		};
		expect(await finalizeFailedShipments(payload, NOW)).toEqual([]);
		expect(payload.store.shipments?.[0]).toMatchObject({
			status: "in_transit",
		});
		expect(payload.store.shipments?.[0]?.finalFailure).toBeUndefined();
		expect(triggerNotificationEvent).not.toHaveBeenCalled();
	});
});

describe("expirePickupHolds", () => {
	const held = (
		deadlineOffset: number,
		overrides: Record<string, unknown> = {},
	) =>
		shipment({
			method: "pickup",
			status: "pending",
			readyForPickupAt: iso(-5 * DAY),
			pickupDeadline: iso(deadlineOffset),
			...overrides,
		});

	it("reminds the buyer once inside the 48 h lead", async () => {
		const payload = seeded([held(47 * HOUR)]);
		expect((await expirePickupHolds(payload, NOW)).reminded).toEqual([
			"shipment-1",
		]);
		expect(await expirePickupHolds(payload, NOW)).toEqual({
			reminded: [],
			expired: [],
		});
		const reminders = triggerNotificationEvent.mock.calls.filter(
			([call]) => call.event === "shipment-pickup-reminder",
		);
		expect(reminders).toHaveLength(1);
		expect(reminders[0]?.[0]).toMatchObject({
			subscriberId: "buyer-1",
			payload: { orderId: "order-1", pickupDeadline: iso(47 * HOUR) },
		});
	});

	it("does not remind before the lead window", async () => {
		const payload = seeded([held(49 * HOUR)]);
		expect(await expirePickupHolds(payload, NOW)).toEqual({
			reminded: [],
			expired: [],
		});
	});

	it("fails the parcel as not_collected and returns it in one pass", async () => {
		const payload = seeded([held(-1000)]);
		expect((await expirePickupHolds(payload, NOW)).expired).toEqual([
			"shipment-1",
		]);
		expect(payload.store.shipments?.[0]).toMatchObject({
			status: "returned",
			finalFailure: { reason: "not_collected" },
		});
		expect(payload.store.shipments?.[0]?.returnedAt).toBeDefined();
		expect(payload.store.orders?.[0]).toMatchObject({
			status: "delivery_failed",
			deliveryFailure: { reason: "absent" },
		});
		expect(
			payload.store["shipment-events"]?.map((event) => event.type),
		).toEqual(
			expect.arrayContaining([
				"shipment.failed_final",
				"shipment.return_initiated",
				"shipment.returned",
			]),
		);
		expect(await expirePickupHolds(payload, NOW)).toEqual({
			reminded: [],
			expired: [],
		});
	});

	it("keeps a hold whose deadline is still ahead", async () => {
		const payload = seeded([
			held(1000, { metadata: { pickupReminderAt: iso(-1) } }),
		]);
		expect((await expirePickupHolds(payload, NOW)).expired).toEqual([]);
		expect(payload.store.shipments?.[0]).toMatchObject({ status: "pending" });
	});
});

describe("flagLateShipments", () => {
	it("flags a live shipment 24 h past promisedBy and tells the shop once", async () => {
		const payload = seeded([
			shipment({ status: "in_transit", promisedBy: iso(-25 * HOUR) }),
		]);
		expect(await flagLateShipments(payload, NOW)).toEqual(["shipment-1"]);
		expect(await flagLateShipments(payload, NOW)).toEqual([]);
		expect(payload.store.shipments?.[0]?.flags).toEqual(["late"]);
		const notices = triggerNotificationEvent.mock.calls.filter(
			([call]) => call.event === "shipment-late",
		);
		expect(notices).toHaveLength(1);
		expect(notices[0]?.[0]).toMatchObject({
			subscriberId: "seller-1",
			payload: { shipmentId: "shipment-1", orderNumber: "ORD-1" },
		});
	});

	it("ignores a shipment inside the grace day and a terminal one", async () => {
		const payload = seeded([
			shipment({ status: "in_transit", promisedBy: iso(-23 * HOUR) }),
			shipment({
				id: "shipment-2",
				status: "delivered",
				promisedBy: iso(-30 * DAY),
			}),
		]);
		expect(await flagLateShipments(payload, NOW)).toEqual([]);
	});
});

describe("remindReturns", () => {
	const returning = (
		startedOffset: number,
		overrides: Record<string, unknown> = {},
	) =>
		shipment({
			finalFailure: {
				reason: "refused",
				at: iso(startedOffset),
				returnInitiatedAt: iso(startedOffset),
			},
			...overrides,
		});

	it("sends the 72 h reminder once", async () => {
		const payload = seeded([returning(-73 * HOUR)]);
		expect((await remindReturns(payload, NOW)).reminded).toEqual([
			"shipment-1",
		]);
		expect(await remindReturns(payload, NOW)).toEqual({
			reminded: [],
			overdue: [],
		});
		expect(
			triggerNotificationEvent.mock.calls.filter(
				([call]) => call.event === "shipment-return-initiated",
			),
		).toHaveLength(1);
		expect(payload.store.reports ?? []).toHaveLength(0);
	});

	it("stays quiet inside 72 h", async () => {
		const payload = seeded([returning(-71 * HOUR)]);
		expect(await remindReturns(payload, NOW)).toEqual({
			reminded: [],
			overdue: [],
		});
	});

	it("flags return_overdue at 7 days with exactly one report", async () => {
		const payload = seeded([returning(-8 * DAY)]);
		expect((await remindReturns(payload, NOW)).overdue).toEqual(["shipment-1"]);
		expect(await remindReturns(payload, NOW)).toEqual({
			reminded: [],
			overdue: [],
		});
		expect(payload.store.shipments?.[0]?.flags).toEqual(["return_overdue"]);
		expect(payload.store.reports).toHaveLength(1);
		expect(payload.store.reports?.[0]).toMatchObject({
			reporter: "seller-1",
			targetType: "shipment",
			targetId: "shipment-1",
			reason: "return_overdue",
			status: "pending",
		});
	});

	it("does not duplicate a report that already exists", async () => {
		const payload = seeded([returning(-8 * DAY)], {
			reports: [
				{
					id: "report-1",
					reporter: "seller-1",
					targetType: "shipment",
					targetId: "shipment-1",
					reason: "return_overdue",
					status: "pending",
				},
			],
		});
		await remindReturns(payload, NOW);
		expect(payload.store.reports).toHaveLength(1);
	});
});

describe("expireRiderLinks", () => {
	const link = (overrides: Record<string, unknown> = {}) => ({
		tokenHash: "hash",
		createdAt: iso(-DAY),
		expiresAt: iso(DAY),
		...overrides,
	});

	it("revokes links past expiresAt and on terminal shipments, and only those", async () => {
		const payload = seeded([
			shipment({
				id: "lapsed",
				status: "in_transit",
				riderLink: link({ expiresAt: iso(-1000) }),
			}),
			shipment({ id: "done", status: "delivered", riderLink: link() }),
			shipment({ id: "live", status: "in_transit", riderLink: link() }),
		]);
		expect((await expireRiderLinks(payload, NOW)).sort()).toEqual([
			"done",
			"lapsed",
		]);
		const byId = Object.fromEntries(
			(payload.store.shipments ?? []).map((row) => [row.id, row]),
		);
		expect(byId.lapsed?.riderLink).toMatchObject({
			revokedAt: NOW.toISOString(),
		});
		expect(byId.done?.riderLink).toMatchObject({
			revokedAt: NOW.toISOString(),
		});
		expect(byId.live?.riderLink?.revokedAt).toBeUndefined();
		expect(await expireRiderLinks(payload, NOW)).toEqual([]);
		expect(
			payload.store["shipment-events"]?.filter(
				(event) => event.type === "shipment.rider_link_revoked",
			),
		).toHaveLength(2);
	});
});

describe("purgeDeliveryProofs", () => {
	const terminal = (
		daysAgo: number,
		id: string,
		overrides: Record<string, unknown> = {},
	) =>
		shipment({
			id,
			status: "delivered",
			deliveredAt: iso(-daysAgo * DAY),
			proof: { photo: `proof-${id}` },
			...overrides,
		});
	const proofRow = (id: string) => ({
		id: `proof-${id}`,
		shipment: id,
		kind: "handover",
		uploadedVia: "rider_app",
	});

	it("deletes proofs at 181 days, keeps 179, and keeps a contested one", async () => {
		const payload = seeded(
			[
				terminal(181, "old"),
				terminal(179, "recent"),
				terminal(181, "contested", { order: "order-2" }),
			],
			{
				"delivery-proofs": [
					proofRow("old"),
					proofRow("recent"),
					proofRow("contested"),
				],
			},
		);
		const contestedOrder = payload.store.orders?.[0];
		payload.store.orders?.push({
			...contestedOrder,
			id: "order-2",
			handover: { contestBy: iso(DAY) },
		});
		const result = await purgeDeliveryProofs(payload, NOW);
		expect(result).toEqual({ shipments: ["old"], proofsDeleted: 1 });
		expect(
			payload.store["delivery-proofs"]?.map((row) => row.shipment).sort(),
		).toEqual(["contested", "recent"]);
		expect(
			payload.store.shipments?.find((row) => row.id === "old"),
		).toMatchObject({ proof: { photo: null } });
		expect(await purgeDeliveryProofs(payload, NOW)).toEqual({
			shipments: [],
			proofsDeleted: 0,
		});
	});

	it("honors a pushed retention guard", async () => {
		const guard = vi.fn(async () => true);
		proofRetentionGuards.push(guard);
		try {
			const payload = seeded([terminal(200, "old")], {
				"delivery-proofs": [proofRow("old")],
			});
			expect(await purgeDeliveryProofs(payload, NOW)).toEqual({
				shipments: [],
				proofsDeleted: 0,
			});
			expect(payload.store["delivery-proofs"]).toHaveLength(1);
			expect(guard).toHaveBeenCalled();
		} finally {
			proofRetentionGuards.splice(proofRetentionGuards.indexOf(guard), 1);
		}
	});
});

describe("pollCourierShipments", () => {
	it("syncs only stale rows through the courier port", async () => {
		vi.stubEnv("COURIER_PROVIDER", "fake");
		const fake = getCourierProvider("yango");
		if (!(fake instanceof FakeCourierProvider))
			throw new Error("fake expected");
		const courier = (id: string, syncedMinutesAgo: number) =>
			shipment({
				id,
				shipmentNumber: `SHP-${id}`,
				status: "pending",
				method: "courier",
				carrier: "courier",
				provider: "yango",
				providerShipmentId: `prov-${id}`,
				lastProviderSyncAt: iso(-syncedMinutesAgo * 60_000),
			});
		const payload = seeded([courier("fresh", 29), courier("stale", 31)]);
		fake.script("prov-stale", [
			{
				reference: "SHP-stale",
				providerShipmentId: "prov-stale",
				providerStatus: "picked_up",
				status: "picked_up",
				occurredAt: new Date(iso(-60_000)),
			},
		]);
		const first = await pollCourierShipments(payload, NOW);
		expect(payload.logger.error).not.toHaveBeenCalled();
		expect(first.polled).toEqual(["stale"]);
		expect(fake.callsTo("getStatus")).toEqual([["prov-stale"]]);
		const rows = Object.fromEntries(
			(payload.store.shipments ?? []).map((row) => [row.id, row]),
		);
		expect(rows.stale).toMatchObject({
			status: "picked_up",
			lastProviderSyncAt: NOW.toISOString(),
		});
		expect(rows.fresh).toMatchObject({ status: "pending" });
	});
});
