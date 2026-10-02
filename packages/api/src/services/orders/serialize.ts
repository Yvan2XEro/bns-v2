import {
	maskPhone,
	type OrderAudience,
	PHONE_MASK_AFTER_TERMINAL_DAYS,
} from "../../access/orderAccess";
import { can, type ShopRole } from "../../access/shopRoles";
import { relationId } from "../../lib/relationId";
import type { Order, OrderEvent, OrderItem } from "../../payload-types";

export interface SerializeOptions {
	/** Injected for deterministic phone-masking tests; defaults to `new Date()`. */
	now?: Date;
}

export interface OrderItemView {
	id: string;
	lineNumber: number | null;
	product: string;
	variant: string;
	sourcing: OrderItem["sourcing"];
	fulfillingShop: string;
	snapshot: {
		title: string | null;
		variantLabel: string | null;
		sku: string | null;
		imageUrl: string | null;
		categoryId: string | null;
		condition: string | null;
		returnPolicy: string | null;
	};
	unitPrice: number;
	quantity: number;
	lineSubtotal: number | null;
	fulfillmentStatus: OrderItem["fulfillmentStatus"];
	commissionRateBps?: number | null;
	commissionAmount?: number | null;
}

export interface OrderEventView {
	id: string;
	type: OrderEvent["type"];
	actorType: OrderEvent["actorType"];
	statusFrom: string | null;
	statusTo: string | null;
	paymentStatusFrom: string | null;
	paymentStatusTo: string | null;
	reason: string | null;
	note: string | null;
	createdAt: string;
}

export interface OrderDeliveryView {
	method: Order["delivery"]["method"];
	recipientName: string;
	phone: string;
	city: Order["delivery"]["city"];
	district: string | null;
	districtOther: string | null;
	landmark: string | null;
	instructions: string | null;
	etaText: string | null;
}

export interface OrderRiskView {
	phoneTier: NonNullable<Order["risk"]>["phoneTier"];
}

interface OrderViewBase {
	id: string;
	orderNumber: string;
	shop: string;
	status: Order["status"];
	paymentMethod: Order["paymentMethod"];
	paymentStatus: Order["paymentStatus"];
	delivery: OrderDeliveryView;
	amounts: Order["amounts"];
	deadlines: Order["deadlines"];
	timestamps: Order["timestamps"];
	cancellation: Order["cancellation"] | null;
	deliveryFailure: Order["deliveryFailure"] | null;
	completionHold: Order["completionHold"] | null;
	completedAt: string | null;
	createdAt: string;
	updatedAt: string;
	items: OrderItemView[];
	events: OrderEventView[];
}

export type BuyerOrderView = OrderViewBase;

export interface ShopOrderView extends OrderViewBase {
	buyer: string | null;
	risk: OrderRiskView | null;
	commission?: { rateBps: number | null; amount: number | null };
}

export interface StaffOrderView extends OrderViewBase {
	buyer: string | null;
	risk: OrderRiskView | null;
}

export interface OrderListEntryView {
	id: string;
	orderNumber: string;
	shop: string;
	status: Order["status"];
	paymentStatus: Order["paymentStatus"];
	total: number | null;
	currency: string | null;
	createdAt: string;
}

/** `Orders.status` values whose `timestamps` field marks the moment they became terminal. P4 only ever writes these three; `returned`/`disputed` are reserved for later phases and have no timestamp field yet. */
const TERMINAL_TIMESTAMP_FIELD: Partial<
	Record<Order["status"], keyof NonNullable<Order["timestamps"]>>
> = {
	completed: "completedAt",
	cancelled: "cancelledAt",
	delivery_failed: "failedAt",
};

function terminalAt(order: Order): Date | null {
	const field = TERMINAL_TIMESTAMP_FIELD[order.status];
	if (!field) return null;
	const raw = order.timestamps?.[field];
	return raw ? new Date(raw) : null;
}

function daysBetween(earlier: Date, later: Date): number {
	return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

/**
 * The buyer always sees their own number in full — it is their data, not
 * something being disclosed to them. A shop or staff viewer sees it in full
 * while the order is live, then masked once `PHONE_MASK_AFTER_TERMINAL_DAYS`
 * have passed since it became terminal: there is no longer an operational
 * reason to call the buyer, so the number stops being handed out. The order
 * document itself is never touched — this only changes what the view says.
 */
function deliveryPhoneFor(order: Order, maskable: boolean, now: Date): string {
	if (!maskable) return order.delivery.phone;
	const since = terminalAt(order);
	if (!since) return order.delivery.phone;
	if (daysBetween(since, now) < PHONE_MASK_AFTER_TERMINAL_DAYS) {
		return order.delivery.phone;
	}
	return maskPhone(order.delivery.phone);
}

function deliveryView(
	order: Order,
	maskable: boolean,
	now: Date,
): OrderDeliveryView {
	return {
		method: order.delivery.method,
		recipientName: order.delivery.recipientName,
		phone: deliveryPhoneFor(order, maskable, now),
		city: order.delivery.city,
		district: order.delivery.district ?? null,
		districtOther: order.delivery.districtOther ?? null,
		landmark: order.delivery.landmark ?? null,
		instructions: order.delivery.instructions ?? null,
		etaText: order.delivery.etaText ?? null,
	};
}

function itemView(item: OrderItem, includeCommission: boolean): OrderItemView {
	return {
		id: item.id,
		lineNumber: item.lineNumber ?? null,
		product: relationId(item.product) ?? "",
		variant: relationId(item.variant) ?? "",
		sourcing: item.sourcing ?? null,
		fulfillingShop: relationId(item.fulfillingShop) ?? "",
		snapshot: {
			title: item.snapshot?.title ?? null,
			variantLabel: item.snapshot?.variantLabel ?? null,
			sku: item.snapshot?.sku ?? null,
			imageUrl: item.snapshot?.imageUrl ?? null,
			categoryId: item.snapshot?.categoryId ?? null,
			condition: item.snapshot?.condition ?? null,
			returnPolicy: item.snapshot?.returnPolicy ?? null,
		},
		unitPrice: item.unitPrice,
		quantity: item.quantity,
		lineSubtotal: item.lineSubtotal ?? null,
		fulfillmentStatus: item.fulfillmentStatus,
		...(includeCommission
			? {
					commissionRateBps: item.commissionRateBps ?? null,
					commissionAmount: item.commissionAmount ?? null,
				}
			: {}),
	};
}

function eventView(event: OrderEvent): OrderEventView {
	return {
		id: event.id,
		type: event.type,
		actorType: event.actorType ?? null,
		statusFrom: event.statusFrom ?? null,
		statusTo: event.statusTo ?? null,
		paymentStatusFrom: event.paymentStatusFrom ?? null,
		paymentStatusTo: event.paymentStatusTo ?? null,
		reason: event.reason ?? null,
		note: event.note ?? null,
		createdAt: event.createdAt,
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
): OrderEventView[] {
	const allowed = eventVisibilitiesFor(audience);
	return events
		.filter((event) => allowed.includes(event.visibility))
		.map(eventView);
}

function base(
	order: Order,
	items: readonly OrderItem[],
	events: readonly OrderEvent[],
	audience: OrderAudience,
	maskable: boolean,
	now: Date,
	includeCommission: boolean,
): OrderViewBase {
	return {
		id: order.id,
		orderNumber: order.orderNumber,
		shop: relationId(order.shop) ?? "",
		status: order.status,
		paymentMethod: order.paymentMethod,
		paymentStatus: order.paymentStatus,
		delivery: deliveryView(order, maskable, now),
		amounts: order.amounts ?? {},
		deadlines: order.deadlines ?? {},
		timestamps: order.timestamps ?? {},
		cancellation: order.cancellation ?? null,
		deliveryFailure: order.deliveryFailure ?? null,
		completionHold: order.completionHold ?? null,
		completedAt: order.timestamps?.completedAt ?? null,
		createdAt: order.createdAt,
		updatedAt: order.updatedAt,
		items: items.map((item) => itemView(item, includeCommission)),
		events: visibleEvents(audience, events),
	};
}

/**
 * The buyer's own order, in full except for what is never anyone's but the
 * shop's to see: no `commission` key at all (not even `null` — a buyer has
 * no stake in the shop's margin) and no `risk` key at all (the buyer must
 * never learn they have been scored).
 */
export function serializeOrderForBuyer(
	order: Order,
	items: readonly OrderItem[],
	events: readonly OrderEvent[],
	options: SerializeOptions = {},
): BuyerOrderView {
	const audience: OrderAudience = { kind: "buyer" };
	return base(
		order,
		items,
		events,
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
 * owner or manager, absent for staff. `risk` carries the tier every member
 * may see to triage an order, never the raw counts behind it.
 */
export function serializeOrderForShop(
	order: Order,
	items: readonly OrderItem[],
	events: readonly OrderEvent[],
	role: ShopRole,
	options: SerializeOptions = {},
): ShopOrderView {
	const audience: OrderAudience = { kind: "shop", role };
	const includeCommission = can(role, "payments.view");
	const now = options.now ?? new Date();
	const view: ShopOrderView = {
		...base(order, items, events, audience, true, now, includeCommission),
		buyer: relationId(order.buyer),
		risk: order.risk?.phoneTier ? { phoneTier: order.risk.phoneTier } : null,
	};
	if (includeCommission) {
		view.commission = {
			rateBps: order.commission?.rateBps ?? null,
			amount: order.commission?.amount ?? null,
		};
	}
	return view;
}

/**
 * A moderator's view: enough to arbitrate a dispute (both parties' full
 * timeline, the delivery details, the risk tier) and nothing of the shop's
 * money — `commission` is never present here, whatever a moderator can read
 * through the raw collection's field access. The REST path is a separate,
 * known quirk recorded in `order-collection-access.int.spec.ts`; this
 * serialiser is the one moderation routes actually use, and it does not
 * inherit that quirk.
 */
export function serializeOrderForStaff(
	order: Order,
	items: readonly OrderItem[],
	events: readonly OrderEvent[],
	options: SerializeOptions = {},
): StaffOrderView {
	const audience: OrderAudience = { kind: "staff" };
	const now = options.now ?? new Date();
	return {
		...base(order, items, events, audience, true, now, false),
		buyer: relationId(order.buyer),
		risk: order.risk?.phoneTier ? { phoneTier: order.risk.phoneTier } : null,
	};
}

/**
 * A row in an order list — buyer's history or a shop's queue alike. Deliberately
 * thin: no delivery address, no phone, no risk, no commission. A list is
 * rendered for many orders at once, which is exactly where a field nobody
 * meant to expose gets noticed least.
 */
export function serializeOrderListEntry(order: Order): OrderListEntryView {
	return {
		id: order.id,
		orderNumber: order.orderNumber,
		shop: relationId(order.shop) ?? "",
		status: order.status,
		paymentStatus: order.paymentStatus,
		total: order.amounts?.total ?? null,
		currency: order.amounts?.currency ?? null,
		createdAt: order.createdAt,
	};
}
