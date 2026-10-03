// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { OrderAudience } from "../../src/access/orderAccess";
import { can, SHOP_ROLES } from "../../src/access/shopRoles";
import type { Order, OrderEvent, OrderItem } from "../../src/payload-types";
import {
	type OrderListRowSources,
	type OrderViewSources,
	serializeOrderForBuyer,
	serializeOrderForShop,
	serializeOrderForStaff,
	serializeOrderListEntry,
	visibleEvents,
} from "../../src/services/orders/serialize";

/**
 * The three single-order projections and the list row, pinned **whole**
 * against the P4 plan's API contracts section. Every assertion below that
 * names a projection compares the full object with `toEqual`, not a handful of
 * fields: the previous version of this spec checked a dozen fields and the
 * serialiser diverged from the contract in seventeen places without one test
 * going red.
 *
 * The fixture deliberately fills **every** optional group at once —
 * `cancellation` and `deliveryFailure` together, a pickup point and a GPS fix
 * together, a part-spent confirmation budget and a live handover — which no
 * real lifecycle produces. It is a projection test: a group left unset is a
 * group whose serialisation nothing would check.
 */

const CONFIRMATION_CODE_HASH = "a".repeat(64);
const HANDOVER_CODE_HASH = "b".repeat(64);
const CONTRACT_SNAPSHOT_HASH = "c".repeat(64);

const PLACED_AT = "2026-01-01T08:00:00.000Z";
const CONFIRMED_AT = "2026-01-01T09:00:00.000Z";
const ACCEPTED_AT = "2026-01-01T10:00:00.000Z";
const SHIPPED_AT = "2026-01-02T08:00:00.000Z";
const DELIVERED_AT = "2026-01-04T08:00:00.000Z";
const CONFIRM_BY = "2026-01-02T08:00:00.000Z";
const ACCEPT_BY = "2026-01-02T10:00:00.000Z";
const STALE_AT = "2026-01-03T08:00:00.000Z";
const COMPLETE_AT = "2026-01-11T08:00:00.000Z";
const WITHDRAWAL_UNTIL = "2026-01-18T08:00:00.000Z";
const CONTEST_BY = "2026-01-06T08:00:00.000Z";
const UPDATED_AT = "2026-01-04T09:00:00.000Z";

function makeOrder(overrides: Partial<Order> = {}): Order {
	return {
		id: "o-1",
		orderNumber: "ORD-2026-01-0001",
		buyer: "u-buyer",
		shop: "s-1",
		status: "delivered",
		paymentMethod: "cod",
		paymentStatus: "cod_pending",
		confirmation: {
			method: "sms_code",
			codeHash: CONFIRMATION_CODE_HASH,
			codeExpiresAt: CONFIRM_BY,
			attempts: 2,
			sentAt: PLACED_AT,
			resendCount: 1,
			confirmedBy: "u-buyer",
		},
		handover: {
			codeHash: HANDOVER_CODE_HASH,
			attempts: 1,
			sentAt: SHIPPED_AT,
			regenerateCount: 2,
			method: "seller_declaration",
			verifiedBy: "u-owner",
			contestBy: CONTEST_BY,
		},
		delivery: {
			method: "pickup",
			recipientName: "Alice Mbarga",
			phone: "+237600000012",
			city: "douala",
			district: "douala.akwa",
			districtOther: null,
			landmark: "Blue gate",
			gps: { lat: 4.05, lng: 9.7, accuracyMeters: 12, capturedAt: PLACED_AT },
			instructions: "Call before arriving",
			pickupPoint: {
				address: "Rue 1.234, Akwa",
				landmark: "Next to the pharmacy",
				gps: { lat: 4.06, lng: 9.71 },
				hours: "09:00-18:00",
			},
			fee: 1_000,
			etaText: "24-48h",
		},
		amounts: {
			subtotal: 10_000,
			deliveryFee: 1_000,
			discount: 0,
			buyerProtectionFee: 0,
			total: 11_000,
			currency: "XAF",
		},
		commission: { rateBps: 500, amount: 550, line: "cl-1" },
		risk: {
			phoneTier: "regular",
			refusalsAtPlacement: 2,
			capsApplied: { shop: "orderTotal" },
		},
		deadlines: {
			confirmBy: CONFIRM_BY,
			acceptBy: ACCEPT_BY,
			staleAt: STALE_AT,
			completeAt: COMPLETE_AT,
			withdrawalUntil: WITHDRAWAL_UNTIL,
		},
		timestamps: {
			placedAt: PLACED_AT,
			confirmedAt: CONFIRMED_AT,
			acceptedAt: ACCEPTED_AT,
			shippedAt: SHIPPED_AT,
			deliveredAt: DELIVERED_AT,
		},
		cancellation: {
			by: "buyer",
			reason: "buyer_changed_mind",
			note: "Changed my mind",
		},
		deliveryFailure: { reason: "absent", attempts: 1, note: "Nobody home" },
		completionHold: "return_case",
		returnCase: "rc-1",
		conversation: "cv-1",
		contract: {
			termsVersion: "2026-09",
			locale: "fr",
			acceptedAt: PLACED_AT,
			snapshotHash: CONTRACT_SNAPSHOT_HASH,
		},
		source: "web",
		createdAt: PLACED_AT,
		updatedAt: UPDATED_AT,
		...overrides,
	};
}

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
	return {
		id: "oi-1",
		order: "o-1",
		lineNumber: 1,
		listing: "l-1",
		product: "p-1",
		variant: "v-1",
		sourcing: "own",
		fulfillingShop: "s-1",
		snapshot: {
			title: "Robe wax",
			variantLabel: "Taille M",
			sku: "RW-M",
			imageUrl: "https://cdn.example/rw.jpg",
			categoryId: "c-1",
			condition: "new",
			returnPolicy: "14 jours",
		},
		unitPrice: 5_000,
		quantity: 2,
		lineSubtotal: 10_000,
		commissionRateBps: 500,
		commissionAmount: 500,
		fulfillmentStatus: "delivered",
		createdAt: PLACED_AT,
		updatedAt: UPDATED_AT,
		...overrides,
	};
}

/** The second line carries no snapshot and no stored subtotal, so the view's fallbacks are exercised rather than assumed. */
const BARE_ITEM: OrderItem = makeItem({
	id: "oi-2",
	lineNumber: 2,
	snapshot: undefined,
	unitPrice: 2_000,
	quantity: 1,
	lineSubtotal: undefined,
	commissionRateBps: undefined,
	commissionAmount: undefined,
	fulfillmentStatus: "unfulfilled",
});

function makeEvent(overrides: Partial<OrderEvent> = {}): OrderEvent {
	return {
		id: "oe-1",
		order: "o-1",
		type: "order.placed",
		visibility: "both",
		createdAt: PLACED_AT,
		updatedAt: PLACED_AT,
		...overrides,
	};
}

const EVENTS: OrderEvent[] = [
	makeEvent({
		id: "e-both",
		type: "order.placed",
		actorType: "buyer",
		actor: "u-buyer",
		note: "First order",
		createdAt: PLACED_AT,
	}),
	makeEvent({
		id: "e-buyer",
		type: "order.confirmation_code_sent",
		visibility: "buyer",
		actorType: "system",
		createdAt: CONFIRMED_AT,
	}),
	makeEvent({
		id: "e-seller",
		type: "order.accepted",
		visibility: "both",
		actorType: "seller",
		actor: "u-owner",
		actorShopRole: "owner",
		createdAt: ACCEPTED_AT,
	}),
	makeEvent({
		id: "e-shop",
		type: "order.commission_accrued",
		visibility: "shop",
		actorType: "system",
		metadata: { commissionLineId: "cl-1", amount: 550, baseAmount: 10_000 },
		createdAt: DELIVERED_AT,
	}),
	makeEvent({
		id: "e-staff",
		type: "order.note_added",
		visibility: "staff",
		actorType: "staff",
		actor: "u-mod",
		reason: "staff_policy",
		note: "Flagged for review",
		createdAt: UPDATED_AT,
	}),
];

const ACTOR_NAMES = new Map([
	["u-buyer", "Alice Mbarga"],
	["u-owner", "Jean Owner"],
	["u-mod", "Mod Moderator"],
]);

const SHOP = {
	id: "s-1",
	name: "Boutique Wax",
	handle: "boutique-wax",
	logoUrl: "https://cdn.example/logo.png",
	city: "douala",
	phone: "+237600000001",
};

function sources(overrides: Partial<OrderViewSources> = {}): OrderViewSources {
	return {
		items: [makeItem(), BARE_ITEM],
		events: EVENTS,
		shop: SHOP,
		buyer: { id: "u-buyer", name: "Alice Mbarga" },
		actorNames: ACTOR_NAMES,
		returnCaseNumber: "RET-2026-01-0007",
		conversationId: "cv-1",
		buyerHasReviewedShop: false,
		...overrides,
	};
}

// --- The expected wire, field for field --------------------------------------

const EXPECTED_AMOUNTS = {
	subtotal: 10_000,
	deliveryFee: 1_000,
	discount: 0,
	buyerProtectionFee: 0,
	total: 11_000,
	currency: "XAF",
};

const EXPECTED_ITEMS = [
	{
		id: "oi-1",
		lineNumber: 1,
		title: "Robe wax",
		variantLabel: "Taille M",
		sku: "RW-M",
		imageUrl: "https://cdn.example/rw.jpg",
		unitPrice: 5_000,
		quantity: 2,
		lineSubtotal: 10_000,
		fulfillmentStatus: "delivered",
		returnPolicy: "14 jours",
	},
	{
		id: "oi-2",
		lineNumber: 2,
		title: "",
		variantLabel: "",
		sku: null,
		imageUrl: null,
		unitPrice: 2_000,
		quantity: 1,
		lineSubtotal: 2_000,
		fulfillmentStatus: "unfulfilled",
		returnPolicy: null,
	},
];

/** The same two lines with the commission a `payments.view` role is handed. */
const EXPECTED_ITEMS_WITH_COMMISSION = [
	{ ...EXPECTED_ITEMS[0], commissionAmount: 500 },
	{ ...EXPECTED_ITEMS[1], commissionAmount: 0 },
];

const EXPECTED_DELIVERY = {
	method: "pickup",
	recipientName: "Alice Mbarga",
	phone: "+237600000012",
	phoneMasked: false,
	city: "douala",
	district: "douala.akwa",
	districtOther: null,
	landmark: "Blue gate",
	gps: { lat: 4.05, lng: 9.7, accuracyMeters: 12 },
	instructions: "Call before arriving",
	etaText: "24-48h",
	fee: 1_000,
	pickupPoint: {
		address: "Rue 1.234, Akwa",
		landmark: "Next to the pharmacy",
		gps: { lat: 4.06, lng: 9.71 },
		hours: "09:00-18:00",
	},
};

const EXPECTED_DEADLINES = {
	confirmBy: CONFIRM_BY,
	acceptBy: ACCEPT_BY,
	staleAt: STALE_AT,
	completeAt: COMPLETE_AT,
	withdrawalUntil: WITHDRAWAL_UNTIL,
	contestBy: CONTEST_BY,
};

const EXPECTED_TIMESTAMPS = {
	placedAt: PLACED_AT,
	confirmedAt: CONFIRMED_AT,
	acceptedAt: ACCEPTED_AT,
	shippedAt: SHIPPED_AT,
	deliveredAt: DELIVERED_AT,
	completedAt: null,
	cancelledAt: null,
	failedAt: null,
};

/** `attempts: 2` of 5 and `resendCount: 1` of 3, and never the hash behind them. */
const EXPECTED_CONFIRMATION = {
	method: "sms_code",
	required: "sms_code",
	attemptsLeft: 3,
	resendsLeft: 2,
};

/** `attempts: 1` of 5, `regenerateCount: 2` of 3, no `lockedAt`. */
const EXPECTED_HANDOVER = {
	method: "seller_declaration",
	locked: false,
	attemptsLeft: 4,
	regenerationsLeft: 1,
};

const EXPECTED_CANCELLATION = {
	by: "buyer",
	reason: "buyer_changed_mind",
	note: "Changed my mind",
};

const EXPECTED_DELIVERY_FAILURE = {
	reason: "absent",
	attempts: 1,
	note: "Nobody home",
};

const EXPECTED_RISK = { phoneTier: "regular", refusalsAtPlacement: 2 };

function timelineRow(
	id: string,
	type: string,
	at: string,
	actorType: string,
	actorName: string | null,
	extra: {
		reason?: string | null;
		note?: string | null;
		metadata?: Record<string, unknown> | null;
	} = {},
) {
	return {
		id,
		type,
		at,
		actorType,
		actorName,
		reason: extra.reason ?? null,
		note: extra.note ?? null,
		metadata: extra.metadata ?? null,
	};
}

const ROW_BOTH = (actorName: string | null) =>
	timelineRow("e-both", "order.placed", PLACED_AT, "buyer", actorName, {
		note: "First order",
	});
const ROW_BUYER = timelineRow(
	"e-buyer",
	"order.confirmation_code_sent",
	CONFIRMED_AT,
	"system",
	null,
);
const ROW_SELLER = (actorName: string | null) =>
	timelineRow("e-seller", "order.accepted", ACCEPTED_AT, "seller", actorName);
const ROW_SHOP = timelineRow(
	"e-shop",
	"order.commission_accrued",
	DELIVERED_AT,
	"system",
	null,
	{ metadata: { commissionLineId: "cl-1", amount: 550, baseAmount: 10_000 } },
);
const ROW_STAFF = (actorName: string | null) =>
	timelineRow("e-staff", "order.note_added", UPDATED_AT, "staff", actorName, {
		reason: "staff_policy",
		note: "Flagged for review",
	});

/** Everything shared by all three audiences' views; each test adds its own audience-only keys. */
const EXPECTED_BASE = {
	id: "o-1",
	orderNumber: "ORD-2026-01-0001",
	status: "delivered",
	paymentStatus: "cod_pending",
	paymentMethod: "cod",
	amounts: EXPECTED_AMOUNTS,
	shop: SHOP,
	delivery: EXPECTED_DELIVERY,
	deadlines: EXPECTED_DEADLINES,
	timestamps: EXPECTED_TIMESTAMPS,
	confirmation: EXPECTED_CONFIRMATION,
	handover: EXPECTED_HANDOVER,
	cancellation: EXPECTED_CANCELLATION,
	deliveryFailure: EXPECTED_DELIVERY_FAILURE,
	completionHold: "return_case",
	returnCaseNumber: "RET-2026-01-0007",
	conversationId: "cv-1",
};

describe("serializeOrderForBuyer: the whole wire, field for field", () => {
	it("is exactly the contract's OrderView for a buyer — no buyer, risk or commission key", () => {
		expect(serializeOrderForBuyer(makeOrder(), sources())).toEqual({
			...EXPECTED_BASE,
			items: EXPECTED_ITEMS,
			timeline: [ROW_BOTH("Alice Mbarga"), ROW_BUYER, ROW_SELLER(null)],
			reviewable: true,
		});
	});

	it("closes `reviewable` once the buyer has reviewed the shop, and changes nothing else", () => {
		const view = serializeOrderForBuyer(
			makeOrder(),
			sources({ buyerHasReviewedShop: true }),
		);
		expect(view.reviewable).toBe(false);
		expect(view).toEqual({
			...EXPECTED_BASE,
			items: EXPECTED_ITEMS,
			timeline: [ROW_BOTH("Alice Mbarga"), ROW_BUYER, ROW_SELLER(null)],
			reviewable: false,
		});
	});

	it("is not reviewable before delivery", () => {
		const view = serializeOrderForBuyer(
			makeOrder({ status: "shipped" }),
			sources(),
		);
		expect(view.reviewable).toBe(false);
		expect(view.status).toBe("shipped");
	});
});

describe("serializeOrderForShop: the whole wire, field for field", () => {
	it("is exactly the contract's OrderView for an owner — buyer, risk and commission present", () => {
		expect(serializeOrderForShop(makeOrder(), sources(), "owner")).toEqual({
			...EXPECTED_BASE,
			items: EXPECTED_ITEMS_WITH_COMMISSION,
			timeline: [ROW_BOTH("Alice Mbarga"), ROW_SELLER("Jean Owner"), ROW_SHOP],
			reviewable: false,
			buyer: { id: "u-buyer", name: "Alice Mbarga" },
			risk: EXPECTED_RISK,
			commission: { rateBps: 500, amount: 550 },
		});
	});

	// The accrual event's metadata carries the commission amount: handing it
	// to a role without payments.view defeated the field gate below.
	it("is exactly the same view minus every commission field for a staff member, the accrual event included", () => {
		expect(serializeOrderForShop(makeOrder(), sources(), "staff")).toEqual({
			...EXPECTED_BASE,
			items: EXPECTED_ITEMS,
			timeline: [ROW_BOTH("Alice Mbarga"), ROW_SELLER("Jean Owner")],
			reviewable: false,
			buyer: { id: "u-buyer", name: "Alice Mbarga" },
			risk: EXPECTED_RISK,
		});
	});

	it("gates commission on the matrix, not on a role string: every role's presence equals can(role, 'payments.view')", () => {
		for (const role of SHOP_ROLES) {
			const view = serializeOrderForShop(makeOrder(), sources(), role);
			const allowed = can(role, "payments.view");
			expect("commission" in view).toBe(allowed);
			expect("commissionAmount" in view.items[0]).toBe(allowed);
		}
	});

	it("gates the commission accrual event on the same matrix cell", () => {
		const accruals = Object.fromEntries(
			SHOP_ROLES.map((role) => [
				role,
				serializeOrderForShop(makeOrder(), sources(), role).timeline.filter(
					(row) => row.type === "order.commission_accrued",
				),
			]),
		);
		expect(accruals).toEqual({
			owner: [ROW_SHOP],
			manager: [ROW_SHOP],
			staff: [],
		});
		for (const role of SHOP_ROLES) {
			expect(accruals[role].length).toBe(can(role, "payments.view") ? 1 : 0);
		}
	});

	it("never carries `capsApplied`, the engine's own working behind the tier", () => {
		const view = serializeOrderForShop(makeOrder(), sources(), "owner");
		expect(view.risk).toEqual(EXPECTED_RISK);
		expect("capsApplied" in view.risk).toBe(false);
	});
});

describe("serializeOrderForStaff: the whole wire, field for field", () => {
	it("is exactly the contract's OrderView for a moderator — every visibility, no commission", () => {
		expect(serializeOrderForStaff(makeOrder(), sources())).toEqual({
			...EXPECTED_BASE,
			items: EXPECTED_ITEMS,
			timeline: [
				ROW_BOTH("Alice Mbarga"),
				ROW_BUYER,
				ROW_SELLER("Jean Owner"),
				ROW_SHOP,
				ROW_STAFF("Mod Moderator"),
			],
			reviewable: false,
			buyer: { id: "u-buyer", name: "Alice Mbarga" },
			risk: EXPECTED_RISK,
		});
	});
});

describe("missing optional groups collapse to the contract's own nulls", () => {
	const bare = makeOrder({
		status: "placed",
		confirmation: undefined,
		handover: undefined,
		delivery: { recipientName: "Alice Mbarga", phone: "+237600000012" },
		amounts: undefined,
		risk: undefined,
		deadlines: undefined,
		timestamps: undefined,
		cancellation: undefined,
		deliveryFailure: undefined,
		completionHold: undefined,
		returnCase: undefined,
		conversation: undefined,
	});

	it("still answers every key the contract declares", () => {
		expect(
			serializeOrderForBuyer(
				bare,
				sources({
					items: [],
					events: [],
					returnCaseNumber: null,
					conversationId: null,
				}),
			),
		).toEqual({
			id: "o-1",
			orderNumber: "ORD-2026-01-0001",
			status: "placed",
			paymentStatus: "cod_pending",
			paymentMethod: "cod",
			amounts: {
				subtotal: 0,
				deliveryFee: 0,
				discount: 0,
				buyerProtectionFee: 0,
				total: 0,
				currency: "XAF",
			},
			items: [],
			timeline: [],
			shop: SHOP,
			delivery: {
				method: "seller_delivery",
				recipientName: "Alice Mbarga",
				phone: "+237600000012",
				phoneMasked: false,
				city: "",
				district: "",
				districtOther: null,
				landmark: null,
				gps: null,
				instructions: null,
				etaText: "",
				fee: 0,
				pickupPoint: null,
			},
			deadlines: {
				confirmBy: null,
				acceptBy: null,
				staleAt: null,
				completeAt: null,
				withdrawalUntil: null,
				contestBy: null,
			},
			timestamps: {
				placedAt: PLACED_AT,
				confirmedAt: null,
				acceptedAt: null,
				shippedAt: null,
				deliveredAt: null,
				completedAt: null,
				cancelledAt: null,
				failedAt: null,
			},
			confirmation: {
				method: null,
				required: "none",
				attemptsLeft: 5,
				resendsLeft: 3,
			},
			handover: {
				method: null,
				locked: false,
				attemptsLeft: 5,
				regenerationsLeft: 3,
			},
			cancellation: null,
			deliveryFailure: null,
			completionHold: "none",
			returnCaseNumber: null,
			conversationId: null,
			reviewable: false,
		});
	});

	it("gives a shop member the tier a scoreless order has, rather than dropping the block", () => {
		const view = serializeOrderForShop(
			bare,
			sources({ items: [], events: [] }),
			"owner",
		);
		expect(view.risk).toEqual({ phoneTier: "new", refusalsAtPlacement: 0 });
	});
});

describe("the confirmation and handover blocks never carry a code", () => {
	const subject = makeOrder();

	it("serialises the confirmation counters and not the hash, the expiry or who confirmed", () => {
		const view = serializeOrderForBuyer(subject, sources());
		expect(view.confirmation).toEqual(EXPECTED_CONFIRMATION);
		expect(JSON.stringify(view.confirmation)).not.toContain(
			CONFIRMATION_CODE_HASH,
		);
		expect(Object.keys(view.confirmation).sort()).toEqual([
			"attemptsLeft",
			"method",
			"required",
			"resendsLeft",
		]);
	});

	it("serialises the handover counters and not the hash, the lock time or who verified", () => {
		const view = serializeOrderForBuyer(subject, sources());
		expect(view.handover).toEqual(EXPECTED_HANDOVER);
		expect(JSON.stringify(view.handover)).not.toContain(HANDOVER_CODE_HASH);
		expect(Object.keys(view.handover).sort()).toEqual([
			"attemptsLeft",
			"locked",
			"method",
			"regenerationsLeft",
		]);
	});

	it("reports a spent attempt budget as locked, with nothing else changed", () => {
		const locked = makeOrder({
			handover: { ...makeOrder().handover, attempts: 5 },
		});
		expect(serializeOrderForBuyer(locked, sources()).handover).toEqual({
			method: "seller_declaration",
			locked: true,
			attemptsLeft: 0,
			regenerationsLeft: 1,
		});
	});

	it("reports an explicitly locked handover as locked even with attempts left", () => {
		const locked = makeOrder({
			handover: { ...makeOrder().handover, lockedAt: SHIPPED_AT },
		});
		expect(serializeOrderForBuyer(locked, sources()).handover.locked).toBe(
			true,
		);
	});

	it("reports nothing outstanding once the buyer has confirmed", () => {
		const confirmed = makeOrder({
			confirmation: { ...makeOrder().confirmation, confirmedAt: CONFIRMED_AT },
		});
		expect(
			serializeOrderForBuyer(confirmed, sources()).confirmation.required,
		).toBe("none");
	});
});

/** Walks a serialised view and flags any key matching /hash/i or any 64-char hex value. */
function findHashLeak(value: unknown, path = ""): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "string" && /^[0-9a-f]{64}$/i.test(value)) {
		return `${path} (64-char hex value)`;
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			const hit = findHashLeak(value[i], `${path}[${i}]`);
			if (hit) return hit;
		}
		return null;
	}
	if (typeof value === "object") {
		for (const [key, inner] of Object.entries(
			value as Record<string, unknown>,
		)) {
			if (/hash/i.test(key)) return `${path}.${key}`;
			const hit = findHashLeak(inner, `${path}.${key}`);
			if (hit) return hit;
		}
	}
	return null;
}

describe("no projection ever carries a hash", () => {
	const subject = makeOrder();
	const views = (): Array<[string, unknown]> => [
		["buyer", serializeOrderForBuyer(subject, sources())],
		["shop:owner", serializeOrderForShop(subject, sources(), "owner")],
		["shop:manager", serializeOrderForShop(subject, sources(), "manager")],
		["shop:staff", serializeOrderForShop(subject, sources(), "staff")],
		["staff", serializeOrderForStaff(subject, sources())],
		["list:buyer", serializeOrderListEntry(subject, listRow(), "buyer")],
		["list:shop", serializeOrderListEntry(subject, listRow(), "shop")],
	];

	it("walks every audience's view and finds no hash-like key or 64-char hex value", () => {
		for (const [name, view] of views()) {
			expect(findHashLeak(view), name).toBeNull();
		}
	});

	it("carries none of the three stored hashes verbatim, in any audience", () => {
		for (const [name, view] of views()) {
			const raw = JSON.stringify(view);
			expect(raw.includes(CONFIRMATION_CODE_HASH), name).toBe(false);
			expect(raw.includes(HANDOVER_CODE_HASH), name).toBe(false);
			expect(raw.includes(CONTRACT_SNAPSHOT_HASH), name).toBe(false);
		}
	});
});

describe("delivery phone: full while live, masked thirty days after terminal", () => {
	const cancelledAt = "2026-01-01T00:00:00.000Z";
	const subject = makeOrder({
		status: "cancelled",
		timestamps: { placedAt: PLACED_AT, cancelledAt },
	});

	it("the shop sees the phone in full while the order is live (no terminal timestamp)", () => {
		const live = makeOrder({ status: "placed" });
		const view = serializeOrderForShop(live, sources(), "owner");
		expect(view.delivery.phone).toBe("+237600000012");
		expect(view.delivery.phoneMasked).toBe(false);
	});

	it("the shop sees the phone in full at 29 days past terminal", () => {
		const now = new Date("2026-01-30T00:00:00.000Z"); // 29 days after cancelledAt
		const view = serializeOrderForShop(subject, sources(), "owner", { now });
		expect(view.delivery.phone).toBe("+237600000012");
		expect(view.delivery.phoneMasked).toBe(false);
	});

	it("the shop sees the phone masked at exactly 30 days past terminal", () => {
		const now = new Date("2026-01-31T00:00:00.000Z"); // 30 days after cancelledAt
		const view = serializeOrderForShop(subject, sources(), "owner", { now });
		expect(view.delivery.phone).toBe("+2376••••••12");
		expect(view.delivery.phoneMasked).toBe(true);
	});

	it("the shop sees the phone masked at 31 days past terminal", () => {
		const now = new Date("2026-02-01T00:00:00.000Z"); // 31 days after cancelledAt
		const view = serializeOrderForShop(subject, sources(), "owner", { now });
		expect(view.delivery.phone).toBe("+2376••••••12");
		expect(view.delivery.phoneMasked).toBe(true);
	});

	it("never mutates the order's stored phone value (A7)", () => {
		const now = new Date("2026-02-01T00:00:00.000Z");
		serializeOrderForShop(subject, sources(), "owner", { now });
		expect(subject.delivery.phone).toBe("+237600000012");
	});

	it("the buyer always sees their own number in full, whatever the order's age", () => {
		const now = new Date("2026-02-01T00:00:00.000Z");
		const view = serializeOrderForBuyer(subject, sources(), { now });
		expect(view.delivery.phone).toBe("+237600000012");
		expect(view.delivery.phoneMasked).toBe(false);
	});
});

describe("the timeline: visibility filtered per audience", () => {
	const idsOf = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

	it("shows a buyer only buyer-and-both events", () => {
		const audience: OrderAudience = { kind: "buyer" };
		expect(idsOf(visibleEvents(audience, EVENTS))).toEqual([
			"e-both",
			"e-buyer",
			"e-seller",
		]);
	});

	it("shows a shop member only shop-and-both events", () => {
		const audience: OrderAudience = { kind: "shop", role: "owner" };
		expect(idsOf(visibleEvents(audience, EVENTS))).toEqual([
			"e-both",
			"e-seller",
			"e-shop",
		]);
	});

	it("reaches staff-visibility events for staff alone", () => {
		const buyerAudience: OrderAudience = { kind: "buyer" };
		const shopAudience: OrderAudience = { kind: "shop", role: "staff" };
		const staffAudience: OrderAudience = { kind: "staff" };
		expect(idsOf(visibleEvents(buyerAudience, EVENTS))).not.toContain(
			"e-staff",
		);
		expect(idsOf(visibleEvents(shopAudience, EVENTS))).not.toContain("e-staff");
		expect(idsOf(visibleEvents(staffAudience, EVENTS))).toContain("e-staff");
	});

	it("gives staff the full timeline, every visibility", () => {
		const audience: OrderAudience = { kind: "staff" };
		expect(idsOf(visibleEvents(audience, EVENTS))).toEqual([
			"e-both",
			"e-buyer",
			"e-seller",
			"e-shop",
			"e-staff",
		]);
	});

	it("keeps a shop-only event out of the buyer's view while the shop's own view carries it whole", () => {
		const buyerView = serializeOrderForBuyer(makeOrder(), sources());
		const shopView = serializeOrderForShop(makeOrder(), sources(), "owner");
		expect(shopView.timeline).toContainEqual(ROW_SHOP);
		expect(buyerView.timeline.map((row) => row.id)).not.toContain("e-shop");
	});

	it("keeps a staff-only event out of both parties' views while staff's carries it whole", () => {
		const staffView = serializeOrderForStaff(makeOrder(), sources());
		expect(staffView.timeline).toContainEqual(ROW_STAFF("Mod Moderator"));
		expect(
			serializeOrderForBuyer(makeOrder(), sources()).timeline.map((r) => r.id),
		).not.toContain("e-staff");
		expect(
			serializeOrderForShop(makeOrder(), sources(), "owner").timeline.map(
				(r) => r.id,
			),
		).not.toContain("e-staff");
	});
});

describe("actorName: nobody learns a name they do not already hold", () => {
	it("names the buyer's own actions to the buyer and nothing else", () => {
		const timeline = serializeOrderForBuyer(makeOrder(), sources()).timeline;
		expect(
			timeline.map((row) => [row.actorType, row.actorName] as const),
		).toEqual([
			["buyer", "Alice Mbarga"],
			["system", null],
			["seller", null],
		]);
	});

	it("names the buyer and the shop's own members to the shop, never a moderator", () => {
		const timeline = serializeOrderForShop(
			makeOrder(),
			sources(),
			"owner",
		).timeline;
		expect(
			timeline.map((row) => [row.actorType, row.actorName] as const),
		).toEqual([
			["buyer", "Alice Mbarga"],
			["seller", "Jean Owner"],
			["system", null],
		]);
	});

	it("names every actor to staff", () => {
		const timeline = serializeOrderForStaff(makeOrder(), sources()).timeline;
		expect(
			timeline.map((row) => [row.actorType, row.actorName] as const),
		).toEqual([
			["buyer", "Alice Mbarga"],
			["system", null],
			["seller", "Jean Owner"],
			["system", null],
			["staff", "Mod Moderator"],
		]);
	});
});

// --- The list row -----------------------------------------------------------

function listRow(
	overrides: Partial<OrderListRowSources> = {},
): OrderListRowSources {
	return {
		shopName: "Boutique Wax",
		itemCount: 3,
		firstItemTitle: "Robe wax",
		firstItemImageUrl: "https://cdn.example/rw.jpg",
		...overrides,
	};
}

describe("serializeOrderListEntry: the whole row, field for field", () => {
	it("is exactly the contract's OrderListEntry for a buyer's own history", () => {
		expect(serializeOrderListEntry(makeOrder(), listRow(), "buyer")).toEqual({
			id: "o-1",
			orderNumber: "ORD-2026-01-0001",
			status: "delivered",
			placedAt: PLACED_AT,
			total: 11_000,
			itemCount: 3,
			firstItemTitle: "Robe wax",
			firstItemImageUrl: "https://cdn.example/rw.jpg",
			shopName: "Boutique Wax",
			deliveryFailureReason: "absent",
		});
	});

	it("adds the three triage fields, and only those, for a shop queue", () => {
		expect(serializeOrderListEntry(makeOrder(), listRow(), "shop")).toEqual({
			id: "o-1",
			orderNumber: "ORD-2026-01-0001",
			status: "delivered",
			placedAt: PLACED_AT,
			total: 11_000,
			itemCount: 3,
			firstItemTitle: "Robe wax",
			firstItemImageUrl: "https://cdn.example/rw.jpg",
			shopName: "Boutique Wax",
			deliveryFailureReason: "absent",
			recipientName: "Alice Mbarga",
			acceptBy: ACCEPT_BY,
			phoneTier: "regular",
		});
	});

	it("omits the triage fields from a buyer's row rather than nulling them", () => {
		const row = serializeOrderListEntry(makeOrder(), listRow(), "buyer");
		expect("recipientName" in row).toBe(false);
		expect("acceptBy" in row).toBe(false);
		expect("phoneTier" in row).toBe(false);
		expect(row.shopName).toBe("Boutique Wax");
	});

	it("carries no address, phone, gps, timeline, items or commission, in either role", () => {
		for (const role of ["buyer", "shop"] as const) {
			const row = serializeOrderListEntry(makeOrder(), listRow(), role);
			const keys = Object.keys(row);
			for (const forbidden of [
				"delivery",
				"amounts",
				"timeline",
				"items",
				"commission",
				"risk",
				"confirmation",
				"handover",
				"buyer",
				"conversationId",
			]) {
				expect(keys, `${role}/${forbidden}`).not.toContain(forbidden);
			}
		}
	});

	it("reads placedAt off the order's own timestamp, falling back to createdAt", () => {
		const row = serializeOrderListEntry(
			makeOrder({ timestamps: {}, createdAt: UPDATED_AT }),
			listRow(),
			"buyer",
		);
		expect(row.placedAt).toBe(UPDATED_AT);
	});
});
