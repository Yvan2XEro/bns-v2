// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

type NotificationPayloadValue = string | number | boolean | null | undefined;

type TriggerCall = {
	event: string;
	subscriberId: string;
	payload: Record<string, NotificationPayloadValue>;
};

// Only the delivery to Novu is replaced: `buildExpoPushData` stays the real
// one, so the payloads below are what a phone receives today.
const { triggerNotificationEvent, hasPushCredential } = vi.hoisted(() => ({
	triggerNotificationEvent: vi.fn(async (_args: TriggerCall) => undefined),
	hasPushCredential: vi.fn(async (_subscriberId: string) => true),
}));
vi.mock("../../src/hooks/notificationEvents", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../../src/hooks/notificationEvents")
	>()),
	triggerNotificationEvent,
	hasPushCredential,
}));
vi.mock("../../src/services/smsProvider", () => ({ sendSms: vi.fn() }));

import {
	isScreenFile,
	matchRoute,
	routeNameOf,
} from "../../../mobile/src/lib/appRoutes";
import {
	type BuyBoxInput,
	decideBuyBox as mobileDecideBuyBox,
} from "../../../mobile/src/lib/buyBox";
import {
	APP_LINK_PREFIXES,
	notificationUrl,
	toAppPath,
} from "../../../mobile/src/lib/deepLinks";
import { SYSTEM_EVENT_KEYS as mobileSystemEventKeys } from "../../../mobile/src/lib/systemMessage";
import { decideBuyBox as webDecideBuyBox } from "../../../web/src/lib/buy-box";
import { SYSTEM_EVENT_KEYS as webSystemEventKeys } from "../../../web/src/lib/system-message";
import { buildExpoPushData } from "../../src/hooks/notificationEvents";
import type { Order, OrderEvent } from "../../src/payload-types";
import { SYSTEM_MESSAGE_EVENTS } from "../../src/services/orders/chat";
import {
	__resetOrderEventHandlers,
	runOrderEventHandlers,
} from "../../src/services/orders/events";
import { registerOrderNotificationHandlers } from "../../src/services/orders/notifications";
import { fakePayload } from "./helpers/fakePayload";

/**
 * The buy box decision exists once per client. Each client's own test pins
 * its copy against fixed rows; neither notices the other drifting. This runs
 * both over every combination of the six inputs and requires one verdict.
 */
describe("the buy box decides the same on web and mobile", () => {
	const shops: BuyBoxInput["shop"][] = [
		null,
		{ id: "s-1", restricted: false },
		{ id: "s-1", restricted: true },
	];
	const rows: BuyBoxInput[] = [];
	for (const ordersEnabled of [true, false])
		for (const orderable of [true, false, null, undefined])
			for (const shop of shops)
				for (const ownShop of [true, false])
					for (const productAvailable of [true, false, null])
						for (const signedIn of [true, false])
							rows.push({
								ordersEnabled,
								orderable,
								shop,
								ownShop,
								productAvailable,
								signedIn,
							});

	it("covers the whole input space", () => {
		expect(rows).toHaveLength(2 * 4 * 3 * 2 * 3 * 2);
		const kinds = new Set(
			rows.map((row) => JSON.stringify(webDecideBuyBox(row))),
		);
		// Every outcome the table can produce is reached: buy (signed in or
		// out), restricted, and the five hidden reasons.
		expect(kinds.size).toBe(8);
	});

	it.each(
		rows.map((row) => [JSON.stringify(row), row] as const),
	)("%s", (_name, row) => {
		expect(mobileDecideBuyBox(row)).toEqual(webDecideBuyBox(row));
	});
});

describe("the order chips in a thread cover what the API posts", () => {
	it("mobile and web map exactly the API's system message events", () => {
		const api = [...SYSTEM_MESSAGE_EVENTS].sort();
		expect(Object.keys(mobileSystemEventKeys).sort()).toEqual(api);
		expect(Object.keys(webSystemEventKeys).sort()).toEqual(api);
	});
});

const APP_DIR = fileURLToPath(new URL("../../../mobile/app", import.meta.url));
const MOBILE_ROUTES = readdirSync(APP_DIR, { recursive: true })
	.map((entry) => String(entry).replaceAll("\\", "/"))
	.filter(isScreenFile)
	.map(routeNameOf);

/** The screen file a tapped push opens on the phone, or null. */
function screenFor(data: Record<string, string> | undefined): string | null {
	const url = data ? notificationUrl(data) : null;
	const path = url ? toAppPath(url) : null;
	return path ? matchRoute(path, MOBILE_ROUTES) : null;
}

/** The same link as the OS hands it over from outside the app. */
function schemeScreenFor(
	data: Record<string, string> | undefined,
): string | null {
	const url = data ? notificationUrl(data) : null;
	if (!url?.startsWith("/")) return null;
	const path = toAppPath(`buynsellem:/${url}`);
	return path ? matchRoute(path, MOBILE_ROUTES) : null;
}

const SHOP = {
	id: "s-1",
	handle: "akwa",
	name: "Akwa Shop",
	owner: "u-owner",
	status: "active",
	level: 2,
	contact: { phone: "+237600000001" },
};

function seed() {
	return fakePayload({
		users: [
			{ id: "u-buyer", role: "user", name: "Buyer", email: "b@example.com" },
			{ id: "u-owner", role: "user", name: "Owner", email: "o@example.com" },
		],
		shops: [SHOP],
		"shop-members": [
			{
				id: "sm-owner",
				shop: "s-1",
				user: "u-owner",
				role: "owner",
				status: "active",
				inboxNotifications: "all",
			},
		],
		orders: [
			{
				id: "order-1",
				orderNumber: "BNS-2610-000001",
				buyer: "u-buyer",
				shop: "s-1",
				status: "delivered",
				paymentMethod: "cod",
				paymentStatus: "cod_pending",
				delivery: { recipientName: "Aicha", phone: "+237699999999" },
				amounts: { total: 47000, currency: "XAF" },
				contract: { locale: "fr" },
				confirmation: {},
				deadlines: { withdrawalUntil: "2026-10-20T00:00:00.000Z" },
				risk: {},
			},
		],
		"order-events": [],
		"return-cases": [],
	});
}

function event(type: OrderEvent["type"], id: string): OrderEvent {
	return {
		id,
		order: "order-1",
		type,
		visibility: "both",
		updatedAt: "2026-10-01T00:00:00.000Z",
		createdAt: "2026-10-01T00:00:00.000Z",
	};
}

async function pushesFor(type: OrderEvent["type"], id: string) {
	const payload = seed();
	const order = (await payload.findByID({
		collection: "orders",
		id: "order-1",
		overrideAccess: true,
	})) as Order;
	await runOrderEventHandlers(payload, order, event(type, id));
	return triggerNotificationEvent.mock.calls.map(([call]) => ({
		event: call.event,
		subscriberId: call.subscriberId,
		data: buildExpoPushData(call.event, call.payload),
	}));
}

describe("an order push opens the right screen on the phone", () => {
	beforeEach(() => {
		triggerNotificationEvent.mockClear();
		// See `order-notifications.int.spec.ts`: the dispatch log is keyed by
		// event id and the fake's ids repeat across instances.
		__resetOrderEventHandlers();
		registerOrderNotificationHandlers();
	});

	it("order-placed: the buyer to their purchase, the shop to its order", async () => {
		const pushes = await pushesFor("order.placed", "ev-entry-1");
		const placed = pushes.filter((p) => p.event === "order-placed");
		expect(
			placed.map((p) => [p.subscriberId, p.data, screenFor(p.data)]).sort(),
		).toEqual(
			[
				[
					"u-buyer",
					{ orderId: "order-1", url: "/purchases/order-1" },
					"purchases/[id]",
				],
				[
					"u-owner",
					{ orderId: "order-1", url: "/seller/orders/order-1" },
					"seller/orders/[id]",
				],
			].sort(),
		);
		for (const push of placed) {
			expect(schemeScreenFor(push.data)).toBe(screenFor(push.data));
		}
	});

	it("order-delivered: the buyer to their purchase, the shop to its order", async () => {
		const pushes = await pushesFor("order.delivered", "ev-entry-2");
		const delivered = pushes.filter((p) => p.event === "order-delivered");
		expect(
			delivered.map((p) => [p.subscriberId, p.data, screenFor(p.data)]).sort(),
		).toEqual(
			[
				[
					"u-buyer",
					{ orderId: "order-1", url: "/purchases/order-1" },
					"purchases/[id]",
				],
				[
					"u-owner",
					{ orderId: "order-1", url: "/seller/orders/order-1" },
					"seller/orders/[id]",
				],
			].sort(),
		);
		for (const push of delivered) {
			expect(schemeScreenFor(push.data)).toBe(screenFor(push.data));
		}
	});

	it("every order and commission workflow lands on an existing screen, by path and by scheme", () => {
		const cases: Array<[string, Record<string, string>, string]> = [
			[
				"order-placed",
				{ orderId: "o-1", audience: "shop" },
				"seller/orders/[id]",
			],
			["order-placed", { orderId: "o-1", audience: "buyer" }, "purchases/[id]"],
			[
				"order-delivered",
				{ orderId: "o-1", audience: "shop" },
				"seller/orders/[id]",
			],
			[
				"order-delivered",
				{ orderId: "o-1", audience: "buyer" },
				"purchases/[id]",
			],
			["order-confirmation-needed", { orderId: "o-1" }, "seller/orders/[id]"],
			["order-accept-reminder", { orderId: "o-1" }, "seller/orders/[id]"],
			["order-stale-reminder", { orderId: "o-1" }, "seller/orders/[id]"],
			["order-accepted", { orderId: "o-1" }, "purchases/[id]"],
			["order-shipped", { orderId: "o-1" }, "purchases/[id]"],
			["order-delivery-declared", { orderId: "o-1" }, "purchases/[id]"],
			["order-review-reminder", { orderId: "o-1" }, "purchases/[id]"],
			["order-cancelled", { orderId: "o-1" }, "purchases/[id]"],
			["order-delivery-failed", { orderId: "o-1" }, "purchases/[id]"],
			["order-withdrawal-requested", { orderId: "o-1" }, "purchases/[id]"],
			[
				"commission-invoice-issued",
				{ invoiceId: "i-1" },
				"seller/billing/[id]",
			],
			[
				"commission-invoice-overdue",
				{ invoiceId: "i-1" },
				"seller/billing/[id]",
			],
			["commission-invoice-paid", { invoiceId: "i-1" }, "seller/billing/[id]"],
			// P5 payment workflows (Task 29): none of these ever reaches the
			// three screens Task 29 itself registers (checkout/[orderId]/pay,
			// .../pending, seller/payments/payouts/[id]) — only the buyer's and
			// shop's order screens, and the seller payments hub and its setup
			// screen. See PAYMENT_DEEP_LINKS in the mobile package's own
			// deepLinks.test.ts for those three.
			["payment-succeeded", { orderId: "o-1" }, "purchases/[id]"],
			["payment-failed", { orderId: "o-1" }, "purchases/[id]"],
			["refund-completed", { orderId: "o-1" }, "purchases/[id]"],
			["refund-failed", { orderId: "o-1" }, "purchases/[id]"],
			[
				"refund-initiated",
				{ orderId: "o-1", audience: "buyer" },
				"purchases/[id]",
			],
			[
				"refund-initiated",
				{ orderId: "o-1", audience: "shop" },
				"seller/orders/[id]",
			],
			["order-paid", { orderId: "o-1" }, "seller/orders/[id]"],
			["payout-sent", { shopId: "s-1" }, "seller/payments/index"],
			["payout-failed", { shopId: "s-1" }, "seller/payments/index"],
			["payout-hold-placed", { shopId: "s-1" }, "seller/payments/index"],
			["payout-hold-released", { shopId: "s-1" }, "seller/payments/index"],
			[
				"payout-receivable-written-off",
				{ shopId: "s-1" },
				"seller/payments/index",
			],
			[
				"payments-onboarding-action",
				{ shopId: "s-1" },
				"seller/payments/setup",
			],
			["payout-account-activated", { shopId: "s-1" }, "seller/payments/setup"],
			["payout-account-review", { shopId: "s-1" }, "seller/payments/setup"],
			["payout-account-changed", { shopId: "s-1" }, "seller/payments/setup"],
		];
		const landed = cases.map(([workflow, payload]) => {
			const data = buildExpoPushData(workflow, payload);
			return [workflow, screenFor(data), schemeScreenFor(data)];
		});
		expect(landed).toEqual(
			cases.map(([workflow, , screen]) => [workflow, screen, screen]),
		);
	});

	// Registrations task: the real buildExpoPushData of the P6 case and P7
	// shipment workflows, resolved against the mobile route table. A null is a
	// push whose link names no screen file.
	it("the case and shipment workflows land on registered screens, or on none", () => {
		const cases: Array<[string, Record<string, string>, string | null]> = [
			[
				"return-requested",
				{ returnId: "r-1", audience: "buyer" },
				"returns/[id]",
			],
			[
				"dispute-resolved",
				{ disputeId: "d-1", audience: "buyer" },
				"disputes/[id]",
			],
			[
				"shipment-attempt-failed",
				{ orderId: "o-1", audience: "buyer" },
				"purchases/[id]",
			],
			[
				"shipment-attempt-failed",
				{ orderId: "o-1", audience: "shop" },
				"seller/orders/[id]",
			],
			[
				"shipment-redelivery-scheduled",
				{ shipmentId: "s-1", audience: "rider" },
				"rider/shipment/[id]",
			],
			[
				"shipment-redelivery-scheduled",
				{ orderId: "o-1", audience: "shop" },
				"seller/orders/[id]",
			],
			["shipment-pickup-reminder", { orderId: "o-1" }, "purchases/[id]"],
			["shipment-late", { shipmentId: "s-1" }, "seller/orders/index"],
			[
				"shipment-return-initiated",
				{ shipmentId: "s-1" },
				"seller/orders/index",
			],
			// Known gaps: the shop-side case and resale push links name no mobile
			// screen (the seller returns screen is a list at /seller/returns).
			["return-requested", { returnId: "r-1", audience: "shop" }, null],
			["dispute-message", { disputeId: "d-1", audience: "shop" }, null],
			["resale-link-requested", { linkId: "l-1" }, null],
			[
				"delivery-settings-incomplete",
				{ shopId: "s-1" },
				"seller/delivery/index",
			],
		];
		const landed = cases.map(([workflow, payload]) => {
			const data = buildExpoPushData(workflow, payload);
			return [workflow, screenFor(data), schemeScreenFor(data)];
		});
		expect(landed).toEqual(
			cases.map(([workflow, , screen]) => [workflow, screen, screen]),
		);
	});

	it("the prefix the app reads is the scheme app.json registers", () => {
		const appJson = JSON.parse(
			readFileSync(
				new URL("../../../mobile/app.json", import.meta.url),
				"utf8",
			),
		) as { expo: { scheme: string } };
		expect(appJson.expo.scheme).toBe("buynsellem");
		expect(APP_LINK_PREFIXES).toContain(`${appJson.expo.scheme}://`);
	});
});
