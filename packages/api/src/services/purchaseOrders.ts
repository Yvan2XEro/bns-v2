import type { Payload, PayloadRequest, Where } from "payload";
import {
	maskPhone,
	PHONE_MASK_AFTER_TERMINAL_DAYS,
} from "../access/orderAccess";
import { isModerator } from "../access/roles";
import { can, resolveShopRole } from "../access/shopRoles";
import type {
	PurchaseOrderListRow,
	PurchaseOrderView,
} from "../contracts/purchaseOrders";
import { getDeliverySettings } from "../lib/deliverySettings";
import { ERROR_CODES } from "../lib/errors";
import { getProvider } from "../lib/payments";
import { getCounterStore } from "../lib/rateLimit";
import { relationId } from "../lib/relationId";
import { getResaleSettings } from "../lib/resaleSettings";
import type { ResaleAdjustMeta } from "../lib/resale";
import { getResaleAdjuster } from "../lib/resale";
import { ServiceError } from "../lib/serviceError";
import { withTransaction } from "../lib/transactions";
import type {
	Order,
	OrderEvent,
	OrderItem,
	PaymentIntent,
	PurchaseOrder,
	ResellerCharge,
	Shop,
} from "../payload-types";
import {
	declareDelivered as declareShipmentDelivered,
	handoverShipment,
} from "./delivery/handover";
import {
	createShipmentForOrder,
	findLiveShipmentForOrder,
} from "./delivery/shipments";
import {
	assertHandoverRateLimit,
	type DeliveryFailureReason,
	markDelivered,
	markDeliveryFailed,
} from "./orders/delivery";
import { cancelResaleOrderBySupplierTimeout } from "./orders/acceptance";
import { registerOrderEventHandler } from "./orders/events";
import { verifyHandoverCode } from "./orders/handover";
import { shipAcceptedOrderInTransaction } from "./orders/shipping";
import { appendOrderEvent } from "./orders/transitions";
import {
	createPaymentIntent,
	markIntentPending,
	NOTCHPAY_SETTLEMENT_CALLBACK_PATH,
} from "./payments";
import {
	clearResellerIneligibilityHold,
	holdResellerListingsForIneligibility,
} from "./resale";
import { nextNumber } from "./sequences";
import { requireShopPermission } from "./shopGuards";
import { isUniqueViolation } from "./shops";
import type { ServiceUser } from "./shops";
import { applyMovement } from "./stock";

const RESALE_CHARGE_OVERDUE_MS = 60 * 24 * 60 * 60 * 1000;

export async function expirePurchaseOrders(
	payload: Payload,
	now = new Date(),
): Promise<string[]> {
	const due = await payload.find({
		collection: "purchase-orders",
		where: {
			and: [
				{ status: { equals: "sent" } },
				{ acceptBy: { less_than_equal: now.toISOString() } },
			],
		},
		limit: 200,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const expired: string[] = [];
	for (const candidate of due.docs) {
		const purchaseOrderId = String(candidate.id);
		const didExpire = await withTransaction(payload, async (req) => {
			const current = await req.payload.findByID({
				collection: "purchase-orders",
				id: purchaseOrderId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (
				current.status !== "sent" ||
				Date.parse(current.acceptBy) > now.getTime()
			) {
				return false;
			}
			const orderId = relationId(current.order);
			if (!orderId) return false;
			const order = await req.payload.findByID({
				collection: "orders",
				id: orderId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (order.status !== "accepted") return false;
			await cancelResaleOrderBySupplierTimeout(req, order);
			await req.payload.update({
				collection: "purchase-orders",
				id: purchaseOrderId,
				req,
				overrideAccess: true,
				data: {
					status: "cancelled",
					cancellation: {
						by: "system",
						reason: "seller_timeout",
						at: now.toISOString(),
					},
					statusHistory: [
						...(current.statusHistory ?? []),
						{
							status: "cancelled",
							source: "system.accept_timeout",
							at: now.toISOString(),
						},
					],
				},
			});
			return true;
		});
		if (didExpire) expired.push(purchaseOrderId);
	}
	return expired;
}

export async function adjustResellerCommission(
	req: PayloadRequest,
	purchaseOrderId: string,
	delta: number,
	meta: ResaleAdjustMeta,
): Promise<void> {
	if (!Number.isSafeInteger(delta) || delta >= 0 || !meta.sourceId) {
		throw new ServiceError(ERROR_CODES.validation, 400);
	}
	const purchaseOrder = await req.payload.findByID({
		collection: "purchase-orders",
		id: purchaseOrderId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const found = await req.payload.find({
		collection: "reseller-commissions",
		where: { purchaseOrder: { equals: purchaseOrderId } },
		limit: 1,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const commission = found.docs[0];
	if (!commission && meta.source !== "cod_refusal") return;
	if (
		commission &&
		commission.adjustments?.some(
			(adjustment) =>
				adjustment.source === meta.source &&
				adjustment.sourceId === meta.sourceId,
		)
	) {
		return;
	}

	const unpaid =
		commission !== undefined &&
		commission.status !== "paid" &&
		commission.status !== "clawed_back";
	const reduction = unpaid
		? Math.min(commission?.amount ?? 0, Math.abs(delta))
		: 0;
	const chargeAmount = Math.abs(delta) - reduction;
	if (unpaid) {
		const remaining = commission.amount - reduction;
		await req.payload.update({
			collection: "reseller-commissions",
			id: String(commission.id),
			req,
			overrideAccess: true,
			data: {
				amount: remaining,
				status: remaining === 0 ? "cancelled" : commission.status,
				...(remaining === 0
					? { cancelReason: "refunded" as const, holdReasons: [] }
					: {}),
				adjustments: [
					...(commission.adjustments ?? []),
					{ source: meta.source, sourceId: meta.sourceId, delta },
				],
			},
		});
		await req.payload.update({
			collection: "purchase-orders",
			id: purchaseOrderId,
			req,
			overrideAccess: true,
			data: {
				resellerCommission: Math.max(
					0,
					purchaseOrder.resellerCommission - reduction,
				),
			},
		});
	} else if (commission) {
		await req.payload.update({
			collection: "reseller-commissions",
			id: String(commission.id),
			req,
			overrideAccess: true,
			data: {
				adjustments: [
					...(commission.adjustments ?? []),
					{ source: meta.source, sourceId: meta.sourceId, delta },
				],
			},
		});
	}
	if (chargeAmount > 0) {
		await req.payload.create({
			collection: "reseller-charges",
			req,
			overrideAccess: true,
			data: {
				resellerShop: relationId(purchaseOrder.resellerShop) ?? "",
				supplierShop: relationId(purchaseOrder.supplierShop) ?? "",
				purchaseOrder: purchaseOrderId,
				type:
					meta.source === "cod_refusal"
						? "cod_refusal_delivery_cost"
						: "clawback",
				amount: chargeAmount,
				status: "open",
			},
		});
	}
}

export async function adjustResellerCommissionForRefund(
	req: PayloadRequest,
	orderId: string,
	refundAmount: number,
	source: "dispute" | "return",
	sourceId: string,
): Promise<void> {
	if (!Number.isSafeInteger(refundAmount) || refundAmount <= 0) return;
	const purchaseOrders = await req.payload.find({
		collection: "purchase-orders",
		where: { order: { equals: orderId } },
		limit: 1,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const purchaseOrder = purchaseOrders.docs[0];
	if (!purchaseOrder) return;
	const commissions = await req.payload.find({
		collection: "reseller-commissions",
		where: { purchaseOrder: { equals: String(purchaseOrder.id) } },
		limit: 1,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const commission = commissions.docs[0];
	if (!commission || commission.amount <= 0) return;
	const saleAmount = purchaseOrder.items.reduce(
		(total, item) => total + item.resellerUnitPrice * item.quantity,
		0,
	);
	if (saleAmount <= 0) {
		throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
	}
	const reduction = Math.min(
		commission.amount,
		Math.round(
			(commission.amount * Math.min(refundAmount, saleAmount)) / saleAmount,
		),
	);
	if (reduction === 0) return;
	await getResaleAdjuster().adjustResellerCommission(
		req,
		String(purchaseOrder.id),
		-reduction,
		{ source, sourceId, ...(source === "dispute" ? { disputeId: sourceId } : {}) },
	);
}

function safeInteger(value: number, field: string): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new ServiceError(ERROR_CODES.resaleInvalidPricing, 409, field);
	}
	return value;
}

/** Creates the supplier-facing fulfilment record once the reseller accepts. */
export async function createPurchaseOrderForAcceptedOrder(
	payload: Payload,
	order: Order,
	now = new Date(),
): Promise<PurchaseOrder | null> {
	const orderId = String(order.id);
	const existing = await payload.find({
		collection: "purchase-orders",
		where: { order: { equals: orderId } },
		limit: 1,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	if (existing.docs[0]) {
		return withTransaction(payload, async (req) => {
			await ensureResellerCommission(req, existing.docs[0]);
			return existing.docs[0];
		});
	}

	const items = await payload.find({
		collection: "order-items",
		where: { order: { equals: orderId } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	if (
		items.docs.length === 0 ||
		items.docs.some((item) => item.sourcing !== "resale")
	) {
		return null;
	}
	const resellerShopId = relationId(order.shop);
	const supplierShopId = relationId(items.docs[0]?.fulfillingShop);
	const linkId = relationId(items.docs[0]?.resaleLink);
	if (
		!resellerShopId ||
		!supplierShopId ||
		!linkId ||
		items.docs.some(
			(item) =>
				relationId(item.fulfillingShop) !== supplierShopId ||
				relationId(item.resaleLink) !== linkId,
		)
	) {
		throw new ServiceError(ERROR_CODES.resaleLinkInactive, 409);
	}
	const reseller: Shop = await payload.findByID({
		collection: "shops",
		id: resellerShopId,
		depth: 0,
		overrideAccess: true,
	});
	const poItems = items.docs.map((item: OrderItem) => {
		const title = item.snapshot?.title?.trim();
		const supplierUnitPrice = safeInteger(
			item.supplierUnitPrice ?? -1,
			"supplierUnitPrice",
		);
		const resellerUnitPrice = safeInteger(item.unitPrice, "resellerUnitPrice");
		const quantity = safeInteger(item.quantity, "quantity");
		if (
			supplierUnitPrice === 0 ||
			resellerUnitPrice === 0 ||
			quantity === 0 ||
			!title
		) {
			throw new ServiceError(ERROR_CODES.resaleInvalidPricing, 409);
		}
		return {
			orderItem: String(item.id),
			variant: relationId(item.variant) ?? "",
			title,
			...(item.snapshot?.variantLabel
				? { variantLabel: item.snapshot.variantLabel }
				: {}),
			...(item.snapshot?.sku ? { sku: item.snapshot.sku } : {}),
			quantity,
			supplierUnitPrice,
			resellerUnitPrice,
			platformCommission: safeInteger(
				item.commissionAmount ?? 0,
				"commissionAmount",
			),
		};
	});
	if (poItems.some((item) => !item.variant)) {
		throw new ServiceError(ERROR_CODES.resaleInvalidPricing, 409);
	}
	const supplierAmount = poItems.reduce(
		(total, item) => total + item.supplierUnitPrice * item.quantity,
		0,
	);
	const saleAmount = poItems.reduce(
		(total, item) => total + item.resellerUnitPrice * item.quantity,
		0,
	);
	const platformCommission = poItems.reduce(
		(total, item) => total + item.platformCommission,
		0,
	);
	const resellerCommission = saleAmount - supplierAmount - platformCommission;
	if (resellerCommission < 0) {
		throw new ServiceError(ERROR_CODES.resaleInvalidPricing, 409);
	}
	const deliveryFee = safeInteger(
		order.amounts?.deliveryFee ?? order.delivery?.fee ?? 0,
		"deliveryFee",
	);
	const sentAt = now.toISOString();
	const number = await nextNumber(payload, "PO", now, { width: 4 });
	const settings = await getResaleSettings(payload);
	return withTransaction(payload, async (req) => {
		const current = await req.payload.find({
			collection: "purchase-orders",
			where: { order: { equals: orderId } },
			limit: 1,
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (current.docs[0]) return current.docs[0];
		const purchaseOrder = await req.payload.create({
			collection: "purchase-orders",
			req,
			overrideAccess: true,
			data: {
				number,
				order: orderId,
				supplierShop: supplierShopId,
				resellerShop: resellerShopId,
				link: linkId,
				status: "sent",
				paymentMethod: order.paymentMethod,
				items: poItems.map(
					({ platformCommission: _commission, ...item }) => item,
				),
				supplierAmount,
				deliveryFee,
				collectAmount:
					order.paymentMethod === "cod" ? saleAmount + deliveryFee : 0,
				platformCommission,
				resellerCommission,
				branding: {
					name: reseller.name,
					handle: reseller.handle,
					logo: relationId(reseller.logo) ?? undefined,
					phone: reseller.contact?.phone ?? undefined,
				},
				sentAt,
				acceptBy: new Date(
					now.getTime() + settings.poAcceptHours * 60 * 60 * 1000,
				).toISOString(),
				statusHistory: [
					{ status: "sent", source: "order.accepted", at: sentAt },
				],
			},
		});
		await ensureResellerCommission(req, purchaseOrder);
		for (const item of items.docs) {
			await req.payload.update({
				collection: "order-items",
				id: item.id,
				data: { purchaseOrder: String(purchaseOrder.id) },
				depth: 0,
				overrideAccess: true,
				req,
			});
		}
		await appendOrderEvent(req, order, {
			type: "order.purchase_order_sent",
			actorType: "system",
			visibility: "shop",
			metadata: {
				purchaseOrderId: String(purchaseOrder.id),
				supplierShopId,
				resellerShopId,
			},
		});
		return purchaseOrder;
	});
}

async function ensureResellerCommission(
	req: PayloadRequest,
	purchaseOrder: PurchaseOrder,
): Promise<void> {
	if (purchaseOrder.resellerCommission <= 0) return;
	const existing = await req.payload.find({
		collection: "reseller-commissions",
		where: { purchaseOrder: { equals: String(purchaseOrder.id) } },
		limit: 1,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (existing.docs[0]) return;
	try {
		await req.payload.create({
			collection: "reseller-commissions",
			overrideAccess: true,
			req,
			data: {
				resellerShop: relationId(purchaseOrder.resellerShop) ?? "",
				supplierShop: relationId(purchaseOrder.supplierShop) ?? "",
				purchaseOrder: String(purchaseOrder.id),
				order: relationId(purchaseOrder.order) ?? "",
				saleAmount: purchaseOrder.items.reduce(
					(total, item) => total + item.resellerUnitPrice * item.quantity,
					0,
				),
				supplierAmount: purchaseOrder.supplierAmount,
				platformCommission: purchaseOrder.platformCommission,
				amount: purchaseOrder.resellerCommission,
				paymentMethod: purchaseOrder.paymentMethod,
				status: "accrued",
			},
		});
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		const recovered = await req.payload.find({
			collection: "reseller-commissions",
			where: { purchaseOrder: { equals: String(purchaseOrder.id) } },
			limit: 1,
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (!recovered.docs[0]) throw error;
	}
}

export function registerPurchaseOrderOrderEvents(): () => void {
	const unregisterAccepted = registerOrderEventHandler(
		"order.accepted",
		async (payload, order, event) => {
			const acceptedAt = new Date(event.createdAt);
			await createPurchaseOrderForAcceptedOrder(
				payload,
				order,
				Number.isNaN(acceptedAt.getTime()) ? new Date() : acceptedAt,
			);
		},
	);
	const statusEvents = [
		["order.shipped", "shipped"],
		["order.delivered", "delivered"],
		["order.delivery_failed", "returned"],
		["order.returned", "returned"],
		["order.cancelled", "cancelled"],
	] as const;
	const unregisterStatus = statusEvents.map(([eventType, status]) =>
		registerOrderEventHandler(eventType, async (payload, order, event) => {
			await syncPurchaseOrderStatus(payload, order, event, status);
		}),
	);
	return () => {
		unregisterAccepted();
		for (const unregister of unregisterStatus) unregister();
	};
}

async function syncPurchaseOrderStatus(
	payload: Payload,
	order: Order,
	event: OrderEvent,
	status: PurchaseOrder["status"],
): Promise<void> {
	const found = await payload.find({
		collection: "purchase-orders",
		where: { order: { equals: String(order.id) } },
		limit: 1,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const purchaseOrderId = found.docs[0]?.id;
	if (!purchaseOrderId) return;
	await withTransaction(payload, async (req) => {
		const current = await req.payload.findByID({
			collection: "purchase-orders",
			id: purchaseOrderId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (current.status === status) return;
		const allowed: Record<
			PurchaseOrder["status"],
			readonly PurchaseOrder["status"][]
		> = {
			sent: ["cancelled"],
			accepted: ["shipped", "delivered", "returned", "cancelled"],
			shipped: ["delivered", "returned", "cancelled"],
			delivered: ["returned"],
			cancelled: [],
			returned: [],
		};
		if (!allowed[current.status].includes(status)) return;
		const at = Number.isFinite(Date.parse(event.createdAt))
			? event.createdAt
			: new Date().toISOString();
		let tracking = current.tracking;
		if (event.type === "order.shipped") {
			const shipmentId = order.shipments
				?.map((shipment) => relationId(shipment))
				.find((id): id is string => Boolean(id));
			if (shipmentId) {
				const shipment = await req.payload.findByID({
					collection: "shipments",
					id: shipmentId,
					depth: 0,
					overrideAccess: true,
					req,
				});
				tracking = {
					...tracking,
					shipment: shipmentId,
					carrier:
						shipment.provider === "yango"
							? "yango"
							: shipment.carrier === "self"
								? "own_courier"
								: "other",
					...(shipment.providerShipmentId || shipment.trackingCode
						? {
								trackingNumber:
									shipment.providerShipmentId ??
									shipment.trackingCode ??
									undefined,
							}
						: {}),
					...(shipment.trackingUrl
						? { trackingUrl: shipment.trackingUrl }
						: {}),
				};
			}
		}
		await req.payload.update({
			collection: "purchase-orders",
			id: purchaseOrderId,
			data: {
				status,
				...(tracking !== current.tracking ? { tracking } : {}),
				statusHistory: [
					...(current.statusHistory ?? []),
					{
						status,
						actor: relationId(event.actor) ?? undefined,
						source: event.type,
						at,
					},
				],
				...(status === "cancelled"
					? {
							cancellation: {
								by:
									event.actorType === "buyer"
										? "buyer"
										: event.actorType === "staff"
											? "staff"
											: event.actorType === "system"
												? "system"
												: "reseller",
								reason: event.reason ?? undefined,
								note: event.note ?? undefined,
								at,
							},
						}
					: {}),
			},
			depth: 0,
			overrideAccess: true,
			req,
		});
	});
}

export async function acceptPurchaseOrder(
	payload: Payload,
	user: ServiceUser,
	purchaseOrderId: string,
	now = new Date(),
): Promise<PurchaseOrder> {
	const initial = await payload
		.findByID({
			collection: "purchase-orders",
			id: purchaseOrderId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!initial) throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	const supplierShopId = relationId(initial.supplierShop);
	if (!supplierShopId)
		throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	await requireShopPermission(payload, user, supplierShopId, "orders.process", {
		writable: true,
	});

	if (initial.status === "accepted") {
		return ensurePurchaseOrderShipment(payload, initial);
	}
	if (initial.status !== "sent") {
		throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
	}
	const accepted = await withTransaction(payload, async (req) => {
		const purchaseOrder = await req.payload.findByID({
			collection: "purchase-orders",
			id: purchaseOrderId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (
			purchaseOrder.status !== "sent" ||
			relationId(purchaseOrder.supplierShop) !== supplierShopId
		) {
			throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
		}
		const acceptBy = Date.parse(purchaseOrder.acceptBy);
		if (!Number.isFinite(acceptBy) || now.getTime() >= acceptBy) {
			throw new ServiceError(ERROR_CODES.purchaseOrderAcceptExpired, 409);
		}
		let handlingHours = 0;
		for (const row of purchaseOrder.items) {
			const orderItemId = relationId(row.orderItem);
			if (!orderItemId) {
				throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
			}
			const orderItem = await req.payload.findByID({
				collection: "order-items",
				id: orderItemId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const productId = relationId(orderItem.product);
			if (!productId) continue;
			const product = await req.payload.findByID({
				collection: "products",
				id: productId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const hours = product.resale?.handlingHours;
			if (
				typeof hours === "number" &&
				Number.isSafeInteger(hours) &&
				hours >= 0
			) {
				handlingHours = Math.max(handlingHours, hours);
			}
		}
		const acceptedAt = now.toISOString();
		const shipBy = new Date(
			now.getTime() + handlingHours * 60 * 60 * 1000,
		).toISOString();
		const updated = await req.payload.update({
			collection: "purchase-orders",
			id: purchaseOrderId,
			data: {
				status: "accepted",
				acceptedAt,
				shipBy,
				statusHistory: [
					...(purchaseOrder.statusHistory ?? []),
					{
						status: "accepted",
						actor: user.id,
						source: "supplier.accepted",
						at: acceptedAt,
					},
				],
			},
			depth: 0,
			overrideAccess: true,
			req,
		});
		const orderId = relationId(purchaseOrder.order);
		if (!orderId)
			throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
		const order = await req.payload.findByID({
			collection: "orders",
			id: orderId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		await appendOrderEvent(req, order, {
			type: "order.purchase_order_accepted",
			actorType: "seller",
			actor: user.id,
			visibility: "shop",
			metadata: { purchaseOrderId: String(updated.id) },
		});
		return updated;
	});
	return ensurePurchaseOrderShipment(payload, accepted);
}

export async function shipPurchaseOrder(
	payload: Payload,
	user: ServiceUser,
	purchaseOrderId: string,
	input: {
		carrier: NonNullable<PurchaseOrder["tracking"]>["carrier"];
		trackingNumber?: string;
		trackingUrl?: string;
	},
): Promise<PurchaseOrder> {
	const initial = await payload
		.findByID({
			collection: "purchase-orders",
			id: purchaseOrderId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!initial) throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	const supplierShopId = relationId(initial.supplierShop);
	if (!supplierShopId) {
		throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	}
	const { role } = await requireShopPermission(
		payload,
		user,
		supplierShopId,
		"orders.process",
		{ writable: true },
	);
	if (initial.status !== "accepted") {
		throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
	}
	if (input.carrier !== "own_courier" && !input.trackingNumber?.trim()) {
		throw new ServiceError(ERROR_CODES.purchaseOrderTrackingRequired, 409);
	}
	if ((await getDeliverySettings(payload)).zonesEnabled) {
		throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
	}

	return withTransaction(payload, async (req) => {
		const current = await req.payload.findByID({
			collection: "purchase-orders",
			id: purchaseOrderId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (
			current.status !== "accepted" ||
			relationId(current.supplierShop) !== supplierShopId
		) {
			throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
		}
		if ((await getDeliverySettings(req.payload)).zonesEnabled) {
			throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
		}
		const orderId = relationId(current.order);
		if (!orderId) {
			throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
		}
		const order = await req.payload.findByID({
			collection: "orders",
			id: orderId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const items = await req.payload.find({
			collection: "order-items",
			where: { order: { equals: orderId } },
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (
			items.docs.length === 0 ||
			items.docs.some(
				(item) =>
					item.sourcing !== "resale" ||
					relationId(item.fulfillingShop) !== supplierShopId,
			)
		) {
			throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
		}
		const result = await shipAcceptedOrderInTransaction(req, order, {
			actorType: "seller",
			actor: user.id,
			actorShopRole: role,
		});
		const shippedAt = result.event.createdAt;
		return req.payload.update({
			collection: "purchase-orders",
			id: purchaseOrderId,
			data: {
				status: "shipped",
				tracking: {
					...current.tracking,
					carrier: input.carrier,
					...(input.trackingNumber?.trim()
						? { trackingNumber: input.trackingNumber.trim() }
						: {}),
					...(input.trackingUrl ? { trackingUrl: input.trackingUrl } : {}),
				},
				statusHistory: [
					...(current.statusHistory ?? []),
					{
						status: "shipped",
						actor: user.id,
						source: "supplier.shipped",
						at: shippedAt,
					},
				],
			},
			depth: 0,
			overrideAccess: true,
			req,
		});
	});
}

export async function handoverPurchaseOrder(
	payload: Payload,
	user: ServiceUser,
	purchaseOrderId: string,
	code: string,
): Promise<void> {
	const purchaseOrder = await payload
		.findByID({
			collection: "purchase-orders",
			id: purchaseOrderId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	const supplierShopId = purchaseOrder
		? relationId(purchaseOrder.supplierShop)
		: null;
	if (!purchaseOrder || !supplierShopId) {
		throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	}
	const { role } = await requireShopPermission(
		payload,
		user,
		supplierShopId,
		"orders.process",
		{ writable: true },
	);
	if (purchaseOrder.status !== "shipped") {
		throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
	}
	const orderId = relationId(purchaseOrder.order);
	if (!orderId) {
		throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	}
	const order = await payload.findByID({
		collection: "orders",
		id: orderId,
		depth: 0,
		overrideAccess: true,
	});
	if (order.status !== "shipped") {
		throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
	}
	await assertHandoverRateLimit(getCounterStore(), order);

	await withTransaction(
		payload,
		async (req) => {
			const currentPurchaseOrder = await req.payload.findByID({
				collection: "purchase-orders",
				id: purchaseOrderId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (
				currentPurchaseOrder.status !== "shipped" ||
				relationId(currentPurchaseOrder.supplierShop) !== supplierShopId
			) {
				throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
			}
			const currentOrder = await req.payload.findByID({
				collection: "orders",
				id: orderId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (currentOrder.status !== "shipped") {
				throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
			}
			const deliverySettings = await getDeliverySettings(req.payload);
			const liveShipment = deliverySettings.zonesEnabled
				? await findLiveShipmentForOrder(req, orderId)
				: null;
			if (liveShipment) {
				await handoverShipment(
					req,
					liveShipment,
					{ code },
					{ type: "seller", id: user.id, shopRole: role },
				);
				return;
			}
			if (deliverySettings.zonesEnabled || currentOrder.shipments?.length) {
				throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
			}
			await verifyHandoverCode(req, currentOrder, code, {
				actor: { type: "seller", id: user.id },
			});
			await markDelivered(req, currentOrder, {
				method: "otp",
				actorType: "seller",
				actorShopRole: role,
				actor: user.id,
			});
		},
		{ user },
	);
}

export async function declarePurchaseOrderDelivered(
	payload: Payload,
	user: ServiceUser,
	purchaseOrderId: string,
	input: { note?: string; photoId?: string },
): Promise<void> {
	const purchaseOrder = await payload
		.findByID({
			collection: "purchase-orders",
			id: purchaseOrderId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	const supplierShopId = purchaseOrder
		? relationId(purchaseOrder.supplierShop)
		: null;
	if (!purchaseOrder || !supplierShopId) {
		throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	}
	const { role } = await requireShopPermission(
		payload,
		user,
		supplierShopId,
		"orders.process",
		{ writable: true },
	);
	if (purchaseOrder.status !== "shipped") {
		throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
	}
	const orderId = relationId(purchaseOrder.order);
	if (!orderId) {
		throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	}
	await withTransaction(
		payload,
		async (req) => {
			const order = await req.payload.findByID({
				collection: "orders",
				id: orderId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (order.status !== "shipped") {
				throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
			}
			const liveShipment = await findLiveShipmentForOrder(req, orderId);
			if (liveShipment) {
				await declareShipmentDelivered(
					req,
					liveShipment,
					{ photoId: input.photoId ?? "", note: input.note },
					{ type: "seller", id: user.id, shopRole: role },
				);
				return;
			}
			if (order.shipments?.length) {
				throw new ServiceError(ERROR_CODES.shipmentInvalidTransition, 409);
			}
			await markDelivered(req, order, {
				method: "seller_declaration",
				actorType: "seller",
				actorShopRole: role,
				actor: user.id,
				note: input.note,
				photo: input.photoId,
			});
		},
		{ user },
	);
}

const RESELLER_DELIVERY_FAULT_REASONS: ReadonlySet<DeliveryFailureReason> =
	new Set(["refused", "unreachable", "absent", "address_not_found"]);

export async function failPurchaseOrderDelivery(
	payload: Payload,
	user: ServiceUser,
	purchaseOrderId: string,
	input: {
		reason: DeliveryFailureReason;
		failedDeliveryCost: number;
		note?: string;
	},
): Promise<void> {
	const purchaseOrder = await payload
		.findByID({
			collection: "purchase-orders",
			id: purchaseOrderId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	const supplierShopId = purchaseOrder
		? relationId(purchaseOrder.supplierShop)
		: null;
	if (!purchaseOrder || !supplierShopId) {
		throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	}
	const { role } = await requireShopPermission(
		payload,
		user,
		supplierShopId,
		"orders.process",
		{ writable: true },
	);
	if (purchaseOrder.status !== "shipped") {
		throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
	}
	if ((await getDeliverySettings(payload)).zonesEnabled) {
		throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
	}
	const cost = input.failedDeliveryCost;
	if (
		!Number.isSafeInteger(cost) ||
		cost < 0 ||
		cost > purchaseOrder.deliveryFee ||
		(cost > 0 &&
			(purchaseOrder.paymentMethod !== "cod" ||
				!RESELLER_DELIVERY_FAULT_REASONS.has(input.reason)))
	) {
		throw new ServiceError(ERROR_CODES.badRequest, 400);
	}
	const orderId = relationId(purchaseOrder.order);
	if (!orderId) {
		throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	}

	await withTransaction(
		payload,
		async (req) => {
			const [currentPurchaseOrder, order] = await Promise.all([
				req.payload.findByID({
					collection: "purchase-orders",
					id: purchaseOrderId,
					depth: 0,
					overrideAccess: true,
					req,
				}),
				req.payload.findByID({
					collection: "orders",
					id: orderId,
					depth: 0,
					overrideAccess: true,
					req,
				}),
			]);
			if (
				currentPurchaseOrder.status !== "shipped" ||
				relationId(currentPurchaseOrder.supplierShop) !== supplierShopId ||
				order.status !== "shipped"
			) {
				throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
			}
			await markDeliveryFailed(req, order, {
				reason: input.reason,
				note: input.note,
				actorType: "seller",
				actorShopRole: role,
				actor: user.id,
			});
			const returnedAt = new Date().toISOString();
			await req.payload.update({
				collection: "purchase-orders",
				id: purchaseOrderId,
				req,
				overrideAccess: true,
				data: {
					status: "returned",
					return: {
						reason: input.reason,
						liability: RESELLER_DELIVERY_FAULT_REASONS.has(input.reason)
							? "reseller"
							: "supplier",
						failedDeliveryCost: cost,
					},
					statusHistory: [
						...(currentPurchaseOrder.statusHistory ?? []),
						{
							status: "returned",
							actor: user.id,
							source: "supplier.delivery_failed",
							at: returnedAt,
						},
					],
				},
			});
			if (cost === 0) return;
			if (!relationId(currentPurchaseOrder.resellerShop)) {
				throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
			}
			await getResaleAdjuster().adjustResellerCommission(
				req,
				purchaseOrderId,
				-cost,
				{
					source: "cod_refusal",
					sourceId: `delivery-failure:${purchaseOrderId}`,
				},
			);
			await req.payload.create({
				collection: "commission-lines",
				req,
				overrideAccess: true,
				data: {
					shop: supplierShopId,
					order: orderId,
					kind: "credit",
					paymentMethod: "cod",
					amount: cost,
					reason: "resale_refusal_compensation",
					status: "open",
					accruedAt: returnedAt,
				},
			});
		},
		{ user },
	);
}

export async function receivePurchaseOrderReturn(
	payload: Payload,
	user: ServiceUser,
	purchaseOrderId: string,
	input: { condition: "resellable" | "damaged" },
): Promise<PurchaseOrder> {
	const purchaseOrder = await payload
		.findByID({
			collection: "purchase-orders",
			id: purchaseOrderId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	const supplierShopId = purchaseOrder
		? relationId(purchaseOrder.supplierShop)
		: null;
	if (!purchaseOrder || !supplierShopId) {
		throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	}
	await requireShopPermission(payload, user, supplierShopId, "orders.process", {
		writable: true,
	});
	if (purchaseOrder.status !== "returned" || purchaseOrder.return?.receivedAt) {
		throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
	}
	const orderId = relationId(purchaseOrder.order);
	if (!orderId) throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);

	return withTransaction(
		payload,
		async (req) => {
			const [current, order] = await Promise.all([
				req.payload.findByID({
					collection: "purchase-orders",
					id: purchaseOrderId,
					depth: 0,
					overrideAccess: true,
					req,
				}),
				req.payload.findByID({
					collection: "orders",
					id: orderId,
					depth: 0,
					overrideAccess: true,
					req,
				}),
			]);
			if (
				current.status !== "returned" ||
				current.return?.receivedAt ||
				relationId(current.supplierShop) !== supplierShopId
			) {
				throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
			}

			const quantities = new Map<string, number>();
			for (const item of current.items ?? []) {
				const variantId = relationId(item.variant);
				if (!variantId) {
					throw new ServiceError(
						ERROR_CODES.purchaseOrderInvalidTransition,
						409,
					);
				}
				quantities.set(
					variantId,
					(quantities.get(variantId) ?? 0) + item.quantity,
				);
			}
			for (const [variantId, quantity] of quantities) {
				const variant = await req.payload.findByID({
					collection: "product-variants",
					id: variantId,
					depth: 0,
					overrideAccess: true,
					req,
				});
				if (input.condition !== "damaged" || !variant.trackInventory) continue;
				await applyMovement(req, {
					variant,
					type: "loss",
					quantity: -quantity,
					expectedStockOnHand: variant.stockOnHand,
					unitCost: current.items?.find(
						(item) => relationId(item.variant) === variantId,
					)?.supplierUnitPrice,
					note: `Damaged resale return ${current.number}`,
					actorId: user.id,
					orderRef: order.orderNumber,
				});
			}

			const receivedAt = new Date().toISOString();
			return req.payload.update({
				collection: "purchase-orders",
				id: purchaseOrderId,
				req,
				overrideAccess: true,
				data: {
					status: "returned",
					return: {
						...(current.return ?? {}),
						condition: input.condition,
						receivedAt,
					},
					statusHistory: [
						...(current.statusHistory ?? []),
						{
							status: "returned",
							actor: user.id,
							source: "supplier.return_received",
							at: receivedAt,
						},
					],
				},
			});
		},
		{ user },
	);
}

async function ensurePurchaseOrderShipment(
	payload: Payload,
	purchaseOrder: PurchaseOrder,
): Promise<PurchaseOrder> {
	const settings = await getDeliverySettings(payload);
	if (!settings.zonesEnabled || relationId(purchaseOrder.tracking?.shipment)) {
		return purchaseOrder;
	}
	const orderId = relationId(purchaseOrder.order);
	if (!orderId) {
		throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
	}
	const order = await payload.findByID({
		collection: "orders",
		id: orderId,
		depth: 0,
		overrideAccess: true,
	});
	const shipment = await createShipmentForOrder(payload, order);
	return withTransaction(payload, async (req) => {
		const current = await req.payload.findByID({
			collection: "purchase-orders",
			id: purchaseOrder.id,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (relationId(current.tracking?.shipment)) return current;
		return req.payload.update({
			collection: "purchase-orders",
			id: current.id,
			data: {
				tracking: { ...current.tracking, shipment: String(shipment.id) },
			},
			depth: 0,
			overrideAccess: true,
			req,
		});
	});
}

export type {
	PurchaseOrderListRow,
	PurchaseOrderView,
} from "../contracts/purchaseOrders";

export async function listShopPurchaseOrders(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	options: {
		side: "supplier" | "reseller";
		status?: PurchaseOrder["status"];
		from?: string;
		q?: string;
		page?: number;
		limit?: number;
	},
): Promise<{
	docs: PurchaseOrderListRow[];
	page: number;
	totalDocs: number;
	totalPages: number;
}> {
	const { role } = await requireShopPermission(
		payload,
		user,
		shopId,
		"orders.view",
	);
	const page = options.page ?? 1;
	const limit = options.limit ?? 20;
	const conditions: Where[] = [
		{
			[options.side === "supplier" ? "supplierShop" : "resellerShop"]: {
				equals: shopId,
			},
		},
	];
	if (options.status) conditions.push({ status: { equals: options.status } });
	if (options.from)
		conditions.push({ sentAt: { greater_than_equal: options.from } });
	if (options.q) conditions.push({ number: { like: options.q } });
	const result = await payload.find({
		collection: "purchase-orders",
		where: { and: conditions },
		sort: "-sentAt",
		page,
		limit,
		pagination: true,
		depth: 0,
		overrideAccess: true,
	});
	const docs = await Promise.all(
		result.docs.map(async (purchaseOrder) => {
			const otherShopId = relationId(
				options.side === "supplier"
					? purchaseOrder.resellerShop
					: purchaseOrder.supplierShop,
			);
			if (!otherShopId) {
				throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
			}
			const otherShop = await payload.findByID({
				collection: "shops",
				id: otherShopId,
				depth: 0,
				overrideAccess: true,
			});
			return {
				id: String(purchaseOrder.id),
				number: purchaseOrder.number,
				status: purchaseOrder.status,
				sentAt: purchaseOrder.sentAt,
				acceptBy: purchaseOrder.acceptBy,
				shipBy: purchaseOrder.shipBy ?? null,
				counterparty: {
					id: otherShopId,
					name: otherShop.name,
					handle: otherShop.handle ?? null,
				},
				items: purchaseOrder.items.map(({ title, quantity }) => ({
					title,
					quantity,
				})),
				collectAmount: purchaseOrder.collectAmount,
				supplierAmount: can(role, "payments.view")
					? purchaseOrder.supplierAmount
					: null,
			};
		}),
	);
	return {
		docs,
		page: result.page ?? page,
		totalDocs: result.totalDocs,
		totalPages: result.totalPages,
	};
}

function terminalAt(purchaseOrder: PurchaseOrder): number | null {
	if (
		purchaseOrder.status !== "delivered" &&
		purchaseOrder.status !== "cancelled" &&
		purchaseOrder.status !== "returned"
	) {
		return null;
	}
	const history = purchaseOrder.statusHistory ?? [];
	for (let index = history.length - 1; index >= 0; index -= 1) {
		const entry = history[index];
		if (entry?.status === purchaseOrder.status) {
			const timestamp = Date.parse(entry.at);
			return Number.isFinite(timestamp) ? timestamp : null;
		}
	}
	return null;
}

/** Returns only the party-safe projection; Payload REST permissions remain a separate boundary. */
export async function getPurchaseOrderView(
	payload: Payload,
	user: ServiceUser,
	purchaseOrderId: string,
	now = new Date(),
): Promise<PurchaseOrderView> {
	const purchaseOrder = await payload
		.findByID({
			collection: "purchase-orders",
			id: purchaseOrderId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!purchaseOrder) {
		throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	}
	const supplierShopId = relationId(purchaseOrder.supplierShop);
	const resellerShopId = relationId(purchaseOrder.resellerShop);
	const staff = isModerator(user);
	const [supplierRole, resellerRole] = staff
		? [null, null]
		: await Promise.all([
				resolveShopRole(payload, user.id, supplierShopId),
				resolveShopRole(payload, user.id, resellerShopId),
			]);
	if (!staff && !supplierRole && !resellerRole) {
		throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	}
	const orderId = relationId(purchaseOrder.order);
	if (!orderId) {
		throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	}
	const order = await payload
		.findByID({
			collection: "orders",
			id: orderId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!order) throw new ServiceError(ERROR_CODES.purchaseOrderNotFound, 404);
	const canViewMoney =
		staff ||
		can(supplierRole, "payments.view") ||
		can(resellerRole, "payments.view");
	const terminal = terminalAt(purchaseOrder);
	const phoneMasked =
		terminal !== null &&
		now.getTime() - terminal >= PHONE_MASK_AFTER_TERMINAL_DAYS * 86_400_000;
	const rawGps = order.delivery.gps;
	const gps =
		typeof rawGps?.lat === "number" && typeof rawGps.lng === "number"
			? { lat: rawGps.lat, lng: rawGps.lng }
			: null;
	return {
		...purchaseOrder,
		supplierAmount: canViewMoney ? purchaseOrder.supplierAmount : null,
		platformCommission: canViewMoney ? purchaseOrder.platformCommission : null,
		resellerCommission: canViewMoney ? purchaseOrder.resellerCommission : null,
		delivery: {
			recipientName: order.delivery.recipientName,
			phone: phoneMasked
				? maskPhone(order.delivery.phone)
				: order.delivery.phone,
			phoneMasked,
			city: order.delivery.city ?? null,
			district: order.delivery.district ?? null,
			landmark: order.delivery.landmark ?? null,
			instructions: order.delivery.instructions ?? null,
			gps,
		},
	};
}

export async function markOverdueResellerCharges(
	payload: Payload,
	now = new Date(),
): Promise<{ markedOverdue: number }> {
	const cutoff = new Date(
		now.getTime() - RESALE_CHARGE_OVERDUE_MS,
	).toISOString();
	let markedOverdue = 0;
	while (true) {
		const batch = await payload.find({
			collection: "reseller-charges",
			where: {
				and: [
					{ status: { equals: "open" } },
					{ createdAt: { less_than_equal: cutoff } },
				],
			},
			sort: "createdAt",
			limit: 200,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		});
		if (batch.docs.length === 0) break;

		for (const candidate of batch.docs) {
			const changed = await withTransaction(payload, async (req) => {
				const current = await req.payload.findByID({
					collection: "reseller-charges",
					id: candidate.id,
					depth: 0,
					overrideAccess: true,
					req,
				});
				const createdAt = Date.parse(current.createdAt);
				if (
					current.status !== "open" ||
					!Number.isFinite(createdAt) ||
					createdAt > Date.parse(cutoff)
				) {
					return false;
				}
				await req.payload.update({
					collection: "reseller-charges",
					id: current.id,
					data: { status: "overdue" },
					depth: 0,
					overrideAccess: true,
					req,
				});
				const shopId = relationId(current.resellerShop);
				if (shopId) {
					await holdResellerListingsForIneligibility(req, shopId);
				}
				return true;
			});
			if (changed) markedOverdue += 1;
		}
	}
	return { markedOverdue };
}

export async function payResellerCharge(
	payload: Payload,
	user: ServiceUser,
	chargeId: string,
	now = new Date(),
): Promise<{ checkoutUrl: string }> {
	const charge = await payload
		.findByID({
			collection: "reseller-charges",
			id: chargeId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!charge) throw new ServiceError(ERROR_CODES.resaleChargeNotFound, 404);

	const shopId = relationId(charge.resellerShop);
	if (!shopId) throw new ServiceError(ERROR_CODES.resaleChargeNotFound, 404);
	await requireShopPermission(payload, user, shopId, "payments.view");
	if (charge.status !== "open" && charge.status !== "overdue") {
		throw new ServiceError(ERROR_CODES.resaleChargeNotPayable, 409);
	}
	if (!Number.isSafeInteger(charge.amount) || charge.amount <= 0) {
		throw new ServiceError(ERROR_CODES.resaleChargeNotPayable, 409);
	}

	const { docs: attempts } = await payload.find({
		collection: "payment-intents",
		where: {
			and: [
				{ purpose: { equals: "reseller_charge" } },
				{ targetId: { equals: String(charge.id) } },
			],
		},
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	const live = attempts.find(
		(attempt) =>
			attempt.status === "pending" &&
			attempt.checkoutUrl &&
			(!attempt.expiresAt || new Date(attempt.expiresAt) > now),
	);
	if (live?.checkoutUrl) return { checkoutUrl: live.checkoutUrl };

	const intent = await withTransaction(payload, async (req) => {
		const created = await createPaymentIntent(
			payload,
			{
				purpose: "reseller_charge",
				targetType: "reseller-charge",
				targetId: String(charge.id),
				customerId: user.id,
				amount: charge.amount,
				currency: "XAF",
				provider: "notchpay",
				idempotencyKey: `reseller-charge:${charge.id}:${attempts.length + 1}`,
				now,
			},
			req,
		);
		await req.payload.update({
			collection: "reseller-charges",
			id: charge.id,
			data: {
				paymentIntents: [
					...(charge.paymentIntents ?? []).map((linked) =>
						typeof linked === "string" ? linked : String(linked.id),
					),
					String(created.id),
				],
			},
			depth: 0,
			overrideAccess: true,
			req,
		});
		return created;
	});

	const serverUrl = process.env.PAYLOAD_PUBLIC_SERVER_URL ?? "";
	let checkout: { checkoutUrl?: string; providerReference: string };
	try {
		checkout = await getProvider("notchpay").createPayment({
			reference: String(intent.reference),
			amount: charge.amount,
			currency: "XAF",
			description: `Resale charge ${charge.id}`,
			callbackUrl: new URL(
				NOTCHPAY_SETTLEMENT_CALLBACK_PATH,
				serverUrl,
			).toString(),
			customer: { email: user.email ?? "", name: user.name ?? undefined },
		});
	} catch (error) {
		payload.logger.error({
			msg: "[resale] provider refused to create the charge payment",
			intentId: intent.id,
			err: error,
		});
		throw new ServiceError(ERROR_CODES.paymentProviderUnavailable, 502);
	}

	await withTransaction(payload, (req) =>
		markIntentPending(
			payload,
			String(intent.id),
			{
				providerReference: checkout.providerReference,
				checkoutUrl: checkout.checkoutUrl ?? null,
			},
			req,
		),
	);
	return { checkoutUrl: checkout.checkoutUrl ?? "" };
}

export async function settleResellerChargePayment(
	payload: Payload,
	intent: PaymentIntent,
	req: PayloadRequest,
): Promise<void> {
	if (intent.targetType !== "reseller-charge") return;
	const chargeId = relationId(intent.targetId);
	if (!chargeId) return;

	const charge = await payload
		.findByID({
			collection: "reseller-charges",
			id: chargeId,
			depth: 0,
			overrideAccess: true,
			req,
		})
		.catch(() => null);
	if (!charge || charge.amount !== intent.amount) return;
	if (charge.status !== "open" && charge.status !== "overdue") return;

	await payload.update({
		collection: "reseller-charges",
		id: chargeId,
		data: { status: "paid" } satisfies Partial<ResellerCharge>,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const resellerShopId = relationId(charge.resellerShop);
	if (!resellerShopId) return;
	const remaining = await payload.find({
		collection: "reseller-charges",
		where: {
			and: [
				{ resellerShop: { equals: resellerShopId } },
				{ status: { equals: "overdue" } },
			],
		},
		limit: 1,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (remaining.docs.length === 0) {
		await clearResellerIneligibilityHold(req, resellerShopId);
	}
}
