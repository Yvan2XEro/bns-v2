import {
	maskPhone,
	type OrderAudience,
	PHONE_MASK_AFTER_TERMINAL_DAYS,
} from "../../access/orderAccess";
import { can, type ShopRole } from "../../access/shopRoles";
import {
	CONFIRMATION_MAX_ATTEMPTS,
	CONFIRMATION_MAX_RESENDS,
	HANDOVER_MAX_ATTEMPTS,
	HANDOVER_MAX_REGENERATIONS,
} from "../../lib/orderCodes";
import { relationId } from "../../lib/relationId";
import type { Order, OrderEvent, OrderItem } from "../../payload-types";

export interface SerializeOptions {
	/** Injected for deterministic phone-masking tests; defaults to `new Date()`. */
	now?: Date;
}

/** P4 charges no discount and no buyer-protection fee; both still ship, because the amounts block is a total the buyer can re-add. */
export interface OrderAmountsView {
	subtotal: number;
	deliveryFee: number;
	discount: number;
	buyerProtectionFee: number;
	total: number;
	currency: string;
}

export type ConfirmationMethod = NonNullable<
	NonNullable<Order["confirmation"]>["method"]
>;
export type ConfirmationRequired = "none" | "sms_code" | "seller_call";
export type HandoverMethod = NonNullable<
	NonNullable<Order["handover"]>["method"]
>;
export type BuyerTier = NonNullable<NonNullable<Order["risk"]>["phoneTier"]>;
export type CompletionHold = NonNullable<Order["completionHold"]>;
export type DeliveryMethod = NonNullable<Order["delivery"]["method"]>;
export type OrderActorType = NonNullable<OrderEvent["actorType"]>;

export interface OrderItemView {
	id: string;
	lineNumber: number;
	title: string;
	variantLabel: string;
	sku: string | null;
	imageUrl: string | null;
	unitPrice: number;
	quantity: number;
	lineSubtotal: number;
	fulfillmentStatus: OrderItem["fulfillmentStatus"];
	returnPolicy: string | null;
	/** Shop audience with `payments.view` only. */
	commissionAmount?: number;
}

export interface OrderTimelineEntry {
	id: string;
	type: OrderEvent["type"];
	at: string;
	actorType: OrderActorType;
	actorName: string | null;
	reason: string | null;
	note: string | null;
	metadata: Record<string, unknown> | null;
}

export interface OrderShopView {
	id: string;
	name: string;
	handle: string;
	logoUrl: string | null;
	city: string | null;
	phone: string | null;
}

export interface OrderBuyerView {
	id: string | null;
	name: string | null;
}

export interface PickupPointView {
	address: string;
	landmark: string | null;
	gps: { lat: number; lng: number } | null;
	hours: string | null;
}

export interface OrderDeliveryView {
	method: DeliveryMethod;
	recipientName: string;
	phone: string;
	/** True when `phone` above is the masked form, so a screen never offers a call button on a number it cannot dial. */
	phoneMasked: boolean;
	city: string;
	district: string;
	districtOther: string | null;
	landmark: string | null;
	gps: { lat: number; lng: number; accuracyMeters: number | null } | null;
	instructions: string | null;
	etaText: string;
	fee: number;
	pickupPoint: PickupPointView | null;
}

export interface OrderDeadlinesView {
	confirmBy: string | null;
	acceptBy: string | null;
	staleAt: string | null;
	completeAt: string | null;
	withdrawalUntil: string | null;
	/** Stored on `order.handover.contestBy`, published here because it is a deadline like the others. */
	contestBy: string | null;
}

export interface OrderTimestampsView {
	placedAt: string;
	confirmedAt: string | null;
	acceptedAt: string | null;
	shippedAt: string | null;
	deliveredAt: string | null;
	completedAt: string | null;
	cancelledAt: string | null;
	failedAt: string | null;
}

export interface OrderConfirmationView {
	method: ConfirmationMethod | null;
	required: ConfirmationRequired;
	attemptsLeft: number;
	resendsLeft: number;
}

export interface OrderHandoverView {
	method: HandoverMethod | null;
	locked: boolean;
	attemptsLeft: number;
	regenerationsLeft: number;
}

export interface OrderCancellationView {
	by: string;
	reason: string;
	note: string | null;
}

export interface OrderDeliveryFailureView {
	reason: string;
	attempts: number;
	note: string | null;
}

export interface OrderRiskView {
	phoneTier: BuyerTier;
	refusalsAtPlacement: number;
}

export interface OrderCommissionView {
	rateBps: number;
	amount: number;
}

/**
 * Everything a single-order projection needs that the `orders` document does
 * not itself carry: the shop's and the buyer's display fields, the actor names
 * behind the timeline's `actor` relationships, the return case's human number
 * and whether the buyer has already reviewed this shop. Loaded once per
 * request by `loadOrderViewSources` (`queries.ts`) and handed to whichever of
 * the three serialisers the caller's audience resolved to, so the projection
 * itself stays a pure function of data already in hand.
 */
export interface OrderViewSources {
	items: readonly OrderItem[];
	events: readonly OrderEvent[];
	shop: OrderShopView;
	buyer: OrderBuyerView;
	/** User id -> display name, for every actor of a loaded event. Which of them a given audience may read is `actorNameFor`'s decision, not the loader's. */
	actorNames: ReadonlyMap<string, string>;
	returnCaseNumber: string | null;
	conversationId: string | null;
	/** True when a review by this buyer already exists for this shop, which is what closes the review action. */
	buyerHasReviewedShop: boolean;
}

interface OrderViewBase {
	id: string;
	orderNumber: string;
	status: Order["status"];
	paymentStatus: Order["paymentStatus"];
	paymentMethod: Order["paymentMethod"];
	amounts: OrderAmountsView;
	items: OrderItemView[];
	timeline: OrderTimelineEntry[];
	shop: OrderShopView;
	delivery: OrderDeliveryView;
	deadlines: OrderDeadlinesView;
	timestamps: OrderTimestampsView;
	confirmation: OrderConfirmationView;
	handover: OrderHandoverView;
	cancellation: OrderCancellationView | null;
	deliveryFailure: OrderDeliveryFailureView | null;
	completionHold: CompletionHold;
	returnCaseNumber: string | null;
	conversationId: string | null;
	reviewable: boolean;
}

export type BuyerOrderView = OrderViewBase;

export interface ShopOrderView extends OrderViewBase {
	buyer: OrderBuyerView;
	risk: OrderRiskView;
	commission?: OrderCommissionView;
}

export interface StaffOrderView extends OrderViewBase {
	buyer: OrderBuyerView;
	risk: OrderRiskView;
}

export interface OrderListEntryView {
	id: string;
	orderNumber: string;
	status: Order["status"];
	placedAt: string;
	total: number;
	/** Units the order is for, not rows — the same reading as the cart's own `itemCount`. */
	itemCount: number;
	firstItemTitle: string;
	firstItemImageUrl: string | null;
	shopName: string;
	deliveryFailureReason: string | null;
	/** Shop queue only: a buyer's own list has no use for the recipient, the accept clock or the tier. */
	recipientName?: string;
	acceptBy?: string | null;
	phoneTier?: BuyerTier;
}

/** What a list row needs from outside its own `orders` document. */
export interface OrderListRowSources {
	shopName: string;
	itemCount: number;
	firstItemTitle: string;
	firstItemImageUrl: string | null;
}

/** `Orders.status` values whose `timestamps` field marks the moment they became terminal. P4 only ever writes these three; `returned`/`disputed` are reserved for later phases and have no timestamp field yet. */
const TERMINAL_TIMESTAMP_FIELD: Partial<
	Record<Order["status"], keyof NonNullable<Order["timestamps"]>>
> = {
	completed: "completedAt",
	cancelled: "cancelledAt",
	delivery_failed: "failedAt",
};

/** A delivered or completed order is what stands in for a conversation in `assertOrderReviewAllowed`. */
const REVIEWABLE_STATUSES: ReadonlySet<Order["status"]> = new Set([
	"delivered",
	"completed",
]);

function terminalAt(order: Order): Date | null {
	const field = TERMINAL_TIMESTAMP_FIELD[order.status];
	if (!field) return null;
	const raw = order.timestamps?.[field];
	return raw ? new Date(raw) : null;
}

function daysBetween(earlier: Date, later: Date): number {
	return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

function str(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The buyer always sees their own number in full — it is their data, not
 * something being disclosed to them. A shop or staff viewer sees it in full
 * while the order is live, then masked once `PHONE_MASK_AFTER_TERMINAL_DAYS`
 * have passed since it became terminal: there is no longer an operational
 * reason to call the buyer, so the number stops being handed out. The order
 * document itself is never touched — this only changes what the view says.
 */
function phoneMaskedFor(order: Order, maskable: boolean, now: Date): boolean {
	if (!maskable) return false;
	const since = terminalAt(order);
	if (!since) return false;
	return daysBetween(since, now) >= PHONE_MASK_AFTER_TERMINAL_DAYS;
}

/**
 * `delivery.pickupPoint` is stored as opaque JSON (the shop's point, as it
 * stood at placement), so this is a structural read rather than a cast: a row
 * with no usable `address` is no pickup point at all and comes back null.
 */
function pickupPointOf(value: unknown): PickupPointView | null {
	if (!isPlainObject(value)) return null;
	const address = str(value.address);
	if (!address) return null;
	const rawGps = value.gps;
	let gps: PickupPointView["gps"] = null;
	if (isPlainObject(rawGps)) {
		const lat = num(rawGps.lat);
		const lng = num(rawGps.lng);
		if (lat !== null && lng !== null) gps = { lat, lng };
	}
	return {
		address,
		landmark: str(value.landmark),
		gps,
		hours: str(value.hours),
	};
}

function gpsOf(order: Order): OrderDeliveryView["gps"] {
	const lat = num(order.delivery.gps?.lat);
	const lng = num(order.delivery.gps?.lng);
	if (lat === null || lng === null) return null;
	return { lat, lng, accuracyMeters: num(order.delivery.gps?.accuracyMeters) };
}

function deliveryView(
	order: Order,
	maskable: boolean,
	now: Date,
): OrderDeliveryView {
	const masked = phoneMaskedFor(order, maskable, now);
	return {
		method: order.delivery.method ?? "seller_delivery",
		recipientName: order.delivery.recipientName,
		phone: masked ? maskPhone(order.delivery.phone) : order.delivery.phone,
		phoneMasked: masked,
		city: order.delivery.city ?? "",
		district: order.delivery.district ?? "",
		districtOther: order.delivery.districtOther ?? null,
		landmark: order.delivery.landmark ?? null,
		gps: gpsOf(order),
		instructions: order.delivery.instructions ?? null,
		etaText: order.delivery.etaText ?? "",
		fee: order.delivery.fee ?? 0,
		pickupPoint: pickupPointOf(order.delivery.pickupPoint),
	};
}

function amountsView(order: Order): OrderAmountsView {
	return {
		subtotal: order.amounts?.subtotal ?? 0,
		deliveryFee: order.amounts?.deliveryFee ?? 0,
		discount: order.amounts?.discount ?? 0,
		buyerProtectionFee: order.amounts?.buyerProtectionFee ?? 0,
		total: order.amounts?.total ?? 0,
		currency: order.amounts?.currency ?? "XAF",
	};
}

function deadlinesView(order: Order): OrderDeadlinesView {
	return {
		confirmBy: order.deadlines?.confirmBy ?? null,
		acceptBy: order.deadlines?.acceptBy ?? null,
		staleAt: order.deadlines?.staleAt ?? null,
		completeAt: order.deadlines?.completeAt ?? null,
		withdrawalUntil: order.deadlines?.withdrawalUntil ?? null,
		contestBy: order.handover?.contestBy ?? null,
	};
}

function timestampsView(order: Order): OrderTimestampsView {
	return {
		placedAt: order.timestamps?.placedAt ?? order.createdAt,
		confirmedAt: order.timestamps?.confirmedAt ?? null,
		acceptedAt: order.timestamps?.acceptedAt ?? null,
		shippedAt: order.timestamps?.shippedAt ?? null,
		deliveredAt: order.timestamps?.deliveredAt ?? null,
		completedAt: order.timestamps?.completedAt ?? null,
		cancelledAt: order.timestamps?.cancelledAt ?? null,
		failedAt: order.timestamps?.failedAt ?? null,
	};
}

/**
 * What the buyer still owes before the order can move on. The stored
 * `confirmation.method` is the path `confirmationPathFor` chose at placement;
 * once `confirmedAt` is set nothing is outstanding, and a `verified_phone`
 * order never had anything outstanding in the first place.
 */
function confirmationRequiredFor(order: Order): ConfirmationRequired {
	if (order.confirmation?.confirmedAt) return "none";
	switch (order.confirmation?.method) {
		case "sms_code":
			return "sms_code";
		case "seller_call":
			return "seller_call";
		default:
			return "none";
	}
}

function remaining(limit: number, used: number | null | undefined): number {
	return Math.max(0, limit - (used ?? 0));
}

/** Counters only — never `codeHash`, `codeExpiresAt`, `sentAt` or who verified. */
function confirmationView(order: Order): OrderConfirmationView {
	return {
		method: order.confirmation?.method ?? null,
		required: confirmationRequiredFor(order),
		attemptsLeft: remaining(
			CONFIRMATION_MAX_ATTEMPTS,
			order.confirmation?.attempts,
		),
		resendsLeft: remaining(
			CONFIRMATION_MAX_RESENDS,
			order.confirmation?.resendCount,
		),
	};
}

/** `locked` is the same disjunction `checkHandover` applies: an explicit lock, or the attempt budget spent. */
function handoverView(order: Order): OrderHandoverView {
	const attempts = order.handover?.attempts ?? 0;
	return {
		method: order.handover?.method ?? null,
		locked:
			Boolean(order.handover?.lockedAt) || attempts >= HANDOVER_MAX_ATTEMPTS,
		attemptsLeft: remaining(HANDOVER_MAX_ATTEMPTS, attempts),
		regenerationsLeft: remaining(
			HANDOVER_MAX_REGENERATIONS,
			order.handover?.regenerateCount,
		),
	};
}

function cancellationView(order: Order): OrderCancellationView | null {
	const cancellation = order.cancellation;
	if (!cancellation?.by && !cancellation?.reason) return null;
	return {
		by: cancellation.by ?? "",
		reason: cancellation.reason ?? "",
		note: cancellation.note ?? null,
	};
}

function deliveryFailureView(order: Order): OrderDeliveryFailureView | null {
	const failure = order.deliveryFailure;
	if (!failure?.reason) return null;
	return {
		reason: failure.reason,
		attempts: failure.attempts ?? 0,
		note: failure.note ?? null,
	};
}

function itemView(item: OrderItem, includeCommission: boolean): OrderItemView {
	const view: OrderItemView = {
		id: item.id,
		lineNumber: item.lineNumber ?? 0,
		title: item.snapshot?.title ?? "",
		variantLabel: item.snapshot?.variantLabel ?? "",
		sku: item.snapshot?.sku ?? null,
		imageUrl: item.snapshot?.imageUrl ?? null,
		unitPrice: item.unitPrice,
		quantity: item.quantity,
		lineSubtotal: item.lineSubtotal ?? item.unitPrice * item.quantity,
		fulfillmentStatus: item.fulfillmentStatus,
		returnPolicy: item.snapshot?.returnPolicy ?? null,
	};
	if (includeCommission) view.commissionAmount = item.commissionAmount ?? 0;
	return view;
}

function metadataOf(
	value: OrderEvent["metadata"],
): Record<string, unknown> | null {
	return isPlainObject(value) ? value : null;
}

/**
 * Which actor's name an audience may read off the timeline. Nobody learns a
 * name they do not already hold: the shop and staff are handed the buyer's
 * name in `buyer` anyway and a `seller` actor is one of the shop's own
 * members, the buyer is only ever shown their own name, and a `staff` actor is
 * never named to a party — a moderator arbitrating a dispute is not a person
 * either side gets to address. `system` and `courier` carry no user at all.
 */
function actorNameFor(
	audience: OrderAudience,
	event: OrderEvent,
	actorNames: ReadonlyMap<string, string>,
): string | null {
	const actorType = event.actorType ?? "system";
	if (actorType === "system" || actorType === "courier") return null;
	if (audience.kind !== "staff") {
		if (actorType === "staff") return null;
		if (audience.kind === "buyer" && actorType !== "buyer") return null;
	}
	const actorId = relationId(event.actor);
	return (actorId && actorNames.get(actorId)) || null;
}

function timelineEntry(
	audience: OrderAudience,
	event: OrderEvent,
	actorNames: ReadonlyMap<string, string>,
): OrderTimelineEntry {
	return {
		id: event.id,
		type: event.type,
		at: event.createdAt,
		actorType: event.actorType ?? "system",
		actorName: actorNameFor(audience, event, actorNames),
		reason: event.reason ?? null,
		note: event.note ?? null,
		metadata: metadataOf(event.metadata),
	};
}

/**
 * Which `OrderEvent.visibility` values an audience's timeline includes.
 * `buyer` and `shop` are each handed exactly their own plus `both` — never
 * the other's, never `staff`'s. Staff sees every visibility: they are
 * arbitrating a dispute between the other two, and a partial timeline would
 * let one side's version go unchecked.
 */
function eventVisibilitiesFor(
	audience: OrderAudience,
): readonly OrderEvent["visibility"][] {
	switch (audience.kind) {
		case "buyer":
			return ["buyer", "both"];
		case "shop":
			return ["shop", "both"];
		case "staff":
			return ["buyer", "shop", "both", "staff"];
	}
}

/** The order's timeline, filtered to what one audience may see. */
export function visibleEvents(
	audience: OrderAudience,
	events: readonly OrderEvent[],
	actorNames: ReadonlyMap<string, string> = new Map(),
): OrderTimelineEntry[] {
	const allowed = eventVisibilitiesFor(audience);
	// The accrual event's metadata is the commission amount itself, so it
	// answers to the same `payments.view` cell as the commission fields.
	const hidesCommission =
		audience.kind === "shop" && !can(audience.role, "payments.view");
	return events
		.filter((event) => allowed.includes(event.visibility))
		.filter(
			(event) =>
				!(hidesCommission && event.type === "order.commission_accrued"),
		)
		.map((event) => timelineEntry(audience, event, actorNames));
}

function base(
	order: Order,
	sources: OrderViewSources,
	audience: OrderAudience,
	maskable: boolean,
	now: Date,
	includeCommission: boolean,
): OrderViewBase {
	return {
		id: order.id,
		orderNumber: order.orderNumber,
		status: order.status,
		paymentStatus: order.paymentStatus,
		paymentMethod: order.paymentMethod,
		amounts: amountsView(order),
		items: sources.items.map((item) => itemView(item, includeCommission)),
		timeline: visibleEvents(audience, sources.events, sources.actorNames),
		shop: sources.shop,
		delivery: deliveryView(order, maskable, now),
		deadlines: deadlinesView(order),
		timestamps: timestampsView(order),
		confirmation: confirmationView(order),
		handover: handoverView(order),
		cancellation: cancellationView(order),
		deliveryFailure: deliveryFailureView(order),
		completionHold: order.completionHold ?? "none",
		returnCaseNumber: sources.returnCaseNumber,
		conversationId: sources.conversationId,
		reviewable:
			audience.kind === "buyer" &&
			REVIEWABLE_STATUSES.has(order.status) &&
			!sources.buyerHasReviewedShop,
	};
}

/** Every shop member and every moderator sees the tier and the at-placement refusal count; neither sees `capsApplied`, which is the engine's own working. */
function riskView(order: Order): OrderRiskView {
	return {
		phoneTier: order.risk?.phoneTier ?? "new",
		refusalsAtPlacement: order.risk?.refusalsAtPlacement ?? 0,
	};
}

/**
 * The buyer's own order, in full except for what is never anyone's but the
 * shop's to see: no `commission` key at all (not even `null` — a buyer has
 * no stake in the shop's margin), no `risk` key at all (the buyer must
 * never learn they have been scored) and no `buyer` block (they are it).
 */
export function serializeOrderForBuyer(
	order: Order,
	sources: OrderViewSources,
	options: SerializeOptions = {},
): BuyerOrderView {
	const audience: OrderAudience = { kind: "buyer" };
	return base(
		order,
		sources,
		audience,
		false,
		options.now ?? new Date(),
		false,
	);
}

/**
 * A shop member's view. `commission` is present only when the caller's role
 * carries `payments.view` on the matrix (`can`, never a role-string
 * comparison — P3's I2 defect was exactly that shortcut) — present for an
 * owner or manager, absent for staff.
 */
export function serializeOrderForShop(
	order: Order,
	sources: OrderViewSources,
	role: ShopRole,
	options: SerializeOptions = {},
): ShopOrderView {
	const audience: OrderAudience = { kind: "shop", role };
	const includeCommission = can(role, "payments.view");
	const now = options.now ?? new Date();
	const view: ShopOrderView = {
		...base(order, sources, audience, true, now, includeCommission),
		buyer: sources.buyer,
		risk: riskView(order),
	};
	if (includeCommission) {
		view.commission = {
			rateBps: order.commission?.rateBps ?? 0,
			amount: order.commission?.amount ?? 0,
		};
	}
	return view;
}

/**
 * A moderator's view: enough to arbitrate a dispute (both parties' full
 * timeline, the delivery details, the risk tier and the refusal count) and
 * nothing of the shop's money — `commission` is never present here, whatever
 * the raw collection's field access allows a moderator to read. The REST path
 * is a separate, known quirk recorded in
 * `order-collection-access.int.spec.ts`; this serialiser is the one
 * moderation routes actually use, and it does not inherit that quirk.
 */
export function serializeOrderForStaff(
	order: Order,
	sources: OrderViewSources,
	options: SerializeOptions = {},
): StaffOrderView {
	const audience: OrderAudience = { kind: "staff" };
	const now = options.now ?? new Date();
	return {
		...base(order, sources, audience, true, now, false),
		buyer: sources.buyer,
		risk: riskView(order),
	};
}

/**
 * A row in an order list — buyer's history or a shop's queue alike.
 * Deliberately thin: no delivery address, no phone, no gps, no commission,
 * no timeline. A list is rendered for many orders at once, which is exactly
 * where a field nobody meant to expose gets noticed least. The three triage
 * fields a shop queue needs (`recipientName`, `acceptBy`, `phoneTier`) are
 * keyed off `role` and are absent — not nulled — from a buyer's own list.
 */
export function serializeOrderListEntry(
	order: Order,
	sources: OrderListRowSources,
	role: "buyer" | "shop",
): OrderListEntryView {
	const entry: OrderListEntryView = {
		id: order.id,
		orderNumber: order.orderNumber,
		status: order.status,
		placedAt: order.timestamps?.placedAt ?? order.createdAt,
		total: order.amounts?.total ?? 0,
		itemCount: sources.itemCount,
		firstItemTitle: sources.firstItemTitle,
		firstItemImageUrl: sources.firstItemImageUrl,
		shopName: sources.shopName,
		deliveryFailureReason: order.deliveryFailure?.reason ?? null,
	};
	if (role === "shop") {
		entry.recipientName = order.delivery.recipientName;
		entry.acceptBy = order.deadlines?.acceptBy ?? null;
		entry.phoneTier = order.risk?.phoneTier ?? "new";
	}
	return entry;
}
