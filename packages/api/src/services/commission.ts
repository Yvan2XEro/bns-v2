import type { Payload, PayloadRequest } from "payload";
import { isModerator } from "../access/roles";
import { ORDER_SERVICE_CONTEXT } from "../collections/Orders";
import { SHOP_SERVICE_CONTEXT } from "../collections/Shops";
import { commissionCredit } from "../lib/caseMath";
import { ERROR_CODES } from "../lib/errors";
import {
	commissionForLine,
	invoiceTotals,
	netting,
	sumCommission,
	vatOf,
	weekBoundsDouala,
} from "../lib/orderMath";
import { getOrderSettings, type OrderSettings } from "../lib/orderSettings";
import { getProvider } from "../lib/payments";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import {
	commitContextOf,
	onCommit,
	type TxReq,
	withTransaction,
} from "../lib/transactions";
import type {
	CommissionInvoice,
	CommissionLine,
	Order,
	OrderItem,
	PaymentIntent,
	Shop,
} from "../payload-types";
import { type Actor, ModerationError } from "./moderation";
import { registerOrderEventHandler } from "./orders/events";
import { notifyCommissionInvoicePaid } from "./orders/notifications";
import { appendOrderEvent } from "./orders/transitions";
import {
	createPaymentIntent,
	markIntentPending,
	NOTCHPAY_SETTLEMENT_CALLBACK_PATH,
} from "./payments";
import { nextInvoiceNumber } from "./sequences";
import { requireShopPermission } from "./shopGuards";
import { isUniqueViolation, type ServiceUser } from "./shops";

const DAY_MS = 24 * 60 * 60 * 1000;
const INVOICE_SERIES = "C" as const;
/**
 * No shared "platform legal identity" constant exists yet in the codebase
 * (the order-contract builder that will need one is a later task). Declared
 * here, read from env so a deployment can override it without a code change.
 */
export const PLATFORM_ISSUER = {
	legalName: process.env.PLATFORM_LEGAL_NAME ?? "BuyNSellem SARL",
	supportEmail: process.env.SUPPORT_EMAIL ?? "support@buynsellem.com",
	supportPhone: process.env.SUPPORT_PHONE ?? null,
};

export interface InvoiceLineView {
	orderNumber: string;
	baseAmount: number;
	amount: number;
	kind: CommissionLine["kind"];
}

export interface CommissionInvoiceView {
	id: string;
	invoiceNumber: string;
	periodStart: string;
	periodEnd: string;
	ordersCount: number;
	commissionTotal: number;
	vatAmount: number;
	totalDue: number;
	currency: "XAF";
	status: NonNullable<CommissionInvoice["status"]>;
	issuedAt: string;
	dueAt: string;
	paidAt: string | null;
	lines: InvoiceLineView[];
}

export interface BillingView {
	invoices: CommissionInvoiceView[];
	currentPeriod: {
		periodStart: string;
		periodEnd: string;
		accrued: number;
		ordersCount: number;
	};
	restricted: { since: string; reason: "commission_overdue" | "staff" } | null;
}

/** Category rate wins when the category carries one; the order item's own
 * (set at checkout time, itself defaulted from `defaultCommissionRateBps`)
 * wins otherwise. Looked up at accrual time rather than at checkout, so a
 * staff edit to a category's rate between placement and delivery is honoured. */
async function resolveRateBps(
	payload: Payload,
	item: OrderItem,
	settings: OrderSettings,
	req?: PayloadRequest,
): Promise<number> {
	const categoryId = item.snapshot?.categoryId;
	if (categoryId) {
		const category = await payload
			.findByID({
				collection: "categories",
				id: categoryId,
				depth: 0,
				overrideAccess: true,
				req,
			})
			.catch(() => null);
		if (
			category &&
			typeof category.commissionRateBps === "number" &&
			category.commissionRateBps >= 0
		) {
			return category.commissionRateBps;
		}
	}
	return item.commissionRateBps ?? settings.defaultCommissionRateBps;
}

async function findExistingCharge(
	req: PayloadRequest,
	orderId: string,
): Promise<CommissionLine | null> {
	const { docs } = await req.payload.find({
		collection: "commission-lines",
		where: {
			and: [{ order: { equals: orderId } }, { kind: { equals: "charge" } }],
		},
		limit: 1,
		depth: 0,
		pagination: false,
		overrideAccess: true,
		req,
	});
	return docs[0] ?? null;
}

/**
 * Writes the one `charge` commission line a delivered order ever gets.
 * `req` must be inside a transaction: the line, the per-item commission
 * fields, `order.commission` and the `order.commission_accrued` event all
 * land together, or none of them do.
 *
 * Idempotent two ways, deliberately both: an app-level check (cheap, wins
 * the common case) and the `(order, kind: "charge")` partial unique index
 * (Task 6), whose violation this catches into "already accrued" rather than
 * letting it fail the delivery it rode in on. Either guard alone would be
 * enough; keeping both is what Review Focus 4 asks for — a retried delivery
 * must produce exactly one line regardless of which guard catches it.
 */
export async function accrueCommission(
	req: PayloadRequest,
	order: Order,
	items: readonly OrderItem[],
): Promise<CommissionLine | null> {
	// D2: a cancelled or failed order (or any order not actually delivered)
	// accrues nothing. This is the one guard, not a cancelled-specific and a
	// failed-specific branch, because "delivered" is the only state commission
	// is ever owed from.
	if (order.status !== "delivered") return null;

	const existing = await findExistingCharge(req, String(order.id));
	if (existing) return existing;
	if (items.some((item) => item.sourcing === "resale")) {
		if (items.some((item) => item.sourcing !== "resale")) {
			throw new Error("A resale order cannot mix fulfilment sources");
		}
		const purchaseOrders = await req.payload.find({
			collection: "purchase-orders",
			where: { order: { equals: String(order.id) } },
			limit: 1,
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const purchaseOrder = purchaseOrders.docs[0];
		if (!purchaseOrder) {
			throw new Error(`Resale purchase order missing for order ${order.id}`);
		}
		const amount = purchaseOrder.platformCommission;
		if (amount <= 0) return null;
		const baseAmount = purchaseOrder.items.reduce(
			(total, poItem) => total + poItem.resellerUnitPrice * poItem.quantity,
			0,
		);
		let created: CommissionLine;
		try {
			created = await req.payload.create({
				collection: "commission-lines",
				overrideAccess: true,
				req,
				data: {
					shop: relationId(purchaseOrder.supplierShop) ?? "",
					order: String(order.id),
					kind: "charge",
					paymentMethod: order.paymentMethod,
					baseAmount,
					amount,
					status: "open",
					accruedAt: new Date().toISOString(),
				},
			});
		} catch (error) {
			if (!isUniqueViolation(error)) throw error;
			const recovered = await findExistingCharge(req, String(order.id));
			if (recovered) return recovered;
			throw error;
		}
		await appendOrderEvent(req, order, {
			type: "order.commission_accrued",
			visibility: "shop",
			actorType: "system",
			metadata: {
				commissionLineId: String(created.id),
				amount,
				baseAmount,
				resaleSupplierShop: relationId(purchaseOrder.supplierShop),
			},
		});
		return created;
	}

	const settings = await getOrderSettings(req.payload);
	const rated = await Promise.all(
		items.map(async (item) => ({
			item,
			lineSubtotal: item.lineSubtotal ?? 0,
			rateBps: await resolveRateBps(req.payload, item, settings, req),
		})),
	);
	const baseAmount = rated.reduce((sum, r) => sum + r.lineSubtotal, 0);
	const amount = sumCommission(rated);
	const firstRate = rated[0]?.rateBps ?? settings.defaultCommissionRateBps;
	const uniformRate = rated.every((r) => r.rateBps === firstRate)
		? firstRate
		: settings.defaultCommissionRateBps;

	let created: CommissionLine;
	try {
		created = await req.payload.create({
			collection: "commission-lines",
			overrideAccess: true,
			req,
			data: {
				shop: relationId(order.shop) ?? "",
				order: String(order.id),
				kind: "charge",
				paymentMethod: order.paymentMethod,
				baseAmount,
				amount,
				status: "open",
				accruedAt: new Date().toISOString(),
			},
		});
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		const recovered = await findExistingCharge(req, String(order.id));
		if (recovered) return recovered;
		throw error;
	}

	for (const r of rated) {
		await req.payload.update({
			collection: "order-items",
			id: r.item.id,
			overrideAccess: true,
			context: ORDER_SERVICE_CONTEXT,
			req,
			data: {
				commissionRateBps: r.rateBps,
				commissionAmount: commissionForLine(r.lineSubtotal, r.rateBps),
			},
		});
	}

	await req.payload.update({
		collection: "orders",
		id: order.id,
		overrideAccess: true,
		context: ORDER_SERVICE_CONTEXT,
		req,
		data: { commission: { rateBps: uniformRate, amount, line: created.id } },
	});

	// `shop` visibility: informational for the seller, never shown to the
	// buyer (Task 12's `visibleEvents` excludes it from the buyer audience).
	await appendOrderEvent(req, order, {
		type: "order.commission_accrued",
		visibility: "shop",
		actorType: "system",
		metadata: {
			commissionLineId: String(created.id),
			amount,
			baseAmount,
		},
	});

	return created;
}

/**
 * The integration point with the delivery transition: registered against
 * `order.delivered` rather than called from a route, because Task 14 owns no
 * delivery route to call it from, and the registry already gives the
 * guarantee Review Focus 4 asks for — `runOrderEventHandlers` dispatches a
 * given `OrderEvent.id` once, and `applyTransition`'s conditional write means
 * a replayed "mark delivered" never produces a second `order.delivered`
 * event in the first place. `accrueCommission`'s own duplicate-key guard
 * above is what makes this safe even if something else accrues the same
 * order directly in the same transaction as the transition — belt and
 * braces, not an either/or.
 */
async function accrueCommissionOnDelivery(
	payload: Payload,
	order: Order,
): Promise<void> {
	const { docs: items } = await payload.find({
		collection: "order-items",
		where: { order: { equals: order.id } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	await withTransaction(payload, (req) =>
		accrueCommission(req, order, items as OrderItem[]),
	);
}

registerOrderEventHandler("order.delivered", accrueCommissionOnDelivery);

function sumByKind(
	lines: readonly CommissionLine[],
	kind: CommissionLine["kind"],
): number {
	return lines
		.filter((line) => line.kind === kind)
		.reduce((sum, line) => sum + line.amount, 0);
}

function sellerSnapshotOf(shop: Shop): Record<string, unknown> {
	return {
		name: shop.name,
		handle: shop.handle,
		legalName: shop.legal?.legalName ?? null,
		rccmNumber: shop.legal?.rccmNumber ?? null,
		niu: shop.legal?.niu ?? null,
		city: shop.location?.city ?? null,
		phone: shop.contact?.phone ?? null,
	};
}

/**
 * One pass over every shop with open commission lines accrued by
 * `periodEnd` (Monday–Sunday, `Africa/Douala`). Idempotent per
 * `(shop, periodStart)` two ways, same pairing as `accrueCommission`: a
 * pre-check that skips the common case, and the real unique index (Task 6)
 * whose violation is swallowed as "already issued".
 */
export async function issueInvoicesForWeek(
	payload: Payload,
	now: Date,
): Promise<{ issued: string[]; rolledOver: string[]; netted: string[] }> {
	const { periodStart, periodEnd } = weekBoundsDouala(now);
	const settings = await getOrderSettings(payload);

	const { docs: openLines } = await payload.find({
		collection: "commission-lines",
		where: {
			and: [
				{ status: { equals: "open" } },
				{ accruedAt: { less_than_equal: periodEnd } },
				// P5 collects a mobile-money order's commission at source, so
				// such a line is never owed on an invoice. `not_equals` rather
				// than `equals: "cod"` on purpose: `credit` and `carry_over`
				// lines carry no payment method and must still be invoiced.
				{ paymentMethod: { not_equals: "mobile_money" } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});

	const byShop = new Map<string, CommissionLine[]>();
	for (const line of openLines) {
		const shopId = relationId(line.shop);
		if (!shopId) continue;
		const list = byShop.get(shopId) ?? [];
		list.push(line);
		byShop.set(shopId, list);
	}

	const issued: string[] = [];
	const rolledOver: string[] = [];
	const netted: string[] = [];

	for (const [shopId, lines] of byShop) {
		const already = await payload.find({
			collection: "commission-invoices",
			where: {
				and: [
					{ shop: { equals: shopId } },
					{ periodStart: { equals: periodStart } },
				],
			},
			limit: 1,
			depth: 0,
			pagination: false,
			overrideAccess: true,
		});
		if (already.docs[0]) continue;

		const charges = sumByKind(lines, "charge");
		const credits = sumByKind(lines, "credit");
		const nonVatCredits = lines
			.filter(
				(line) =>
					line.kind === "credit" &&
					line.reason === "resale_refusal_compensation",
			)
			.reduce((sum, line) => sum + line.amount, 0);
		const carryIn = sumByKind(lines, "carry_over");
		const totals = invoiceTotals({
			charges,
			credits,
			nonVatCredits,
			carryOver: -carryIn,
			vatRateBps: settings.vatRateBps,
		});
		const decision = netting({
			commissionTotal: totals.commissionTotal,
			minInvoiceAmount: settings.minInvoiceAmount,
		});

		if (decision.action === "roll_over") {
			rolledOver.push(shopId);
			continue;
		}

		const shop = await payload.findByID({
			collection: "shops",
			id: shopId,
			depth: 0,
			overrideAccess: true,
		});
		const ordersCount = new Set(
			lines.flatMap((line) => {
				const orderId = relationId(line.order);
				return orderId ? [orderId] : [];
			}),
		).size;

		try {
			const invoiceId = await withTransaction(payload, async (req) => {
				const invoiceNumber = await nextInvoiceNumber(req, INVOICE_SERIES, now);
				const created = await req.payload.create({
					collection: "commission-invoices",
					overrideAccess: true,
					req,
					data: {
						kind: "invoice",
						invoiceNumber,
						shop: shopId,
						periodStart,
						periodEnd,
						lines: lines.map((line) => String(line.id)),
						ordersCount,
						commissionTotal: totals.commissionTotal,
						vatRateBps: settings.vatRateBps,
						vatAmount: totals.vatAmount,
						totalDue: decision.action === "invoice" ? totals.totalDue : 0,
						currency: "XAF",
						status: decision.action === "invoice" ? "issued" : "void",
						issuedAt: now.toISOString(),
						dueAt: new Date(
							now.getTime() + settings.invoiceDueDays * DAY_MS,
						).toISOString(),
						sellerSnapshot: sellerSnapshotOf(shop),
						issuerSnapshot: PLATFORM_ISSUER,
					},
				});

				for (const line of lines) {
					await req.payload.update({
						collection: "commission-lines",
						id: line.id,
						overrideAccess: true,
						req,
						data: { status: "invoiced", invoice: created.id },
					});
				}

				if (decision.action === "credit_carry_over") {
					// The credit rolls forward as its own line, picked up the same
					// way any other open line is — `issueInvoicesForWeek` does not
					// need to know its own output is also its input.
					await req.payload.create({
						collection: "commission-lines",
						overrideAccess: true,
						req,
						data: {
							shop: shopId,
							kind: "carry_over",
							amount: decision.carryOver,
							status: "open",
							accruedAt: periodEnd,
						},
					});
				}

				return String(created.id);
			});

			if (decision.action === "invoice") issued.push(invoiceId);
			else netted.push(invoiceId);
		} catch (error) {
			if (isUniqueViolation(error)) continue;
			throw error;
		}
	}

	return { issued, rolledOver, netted };
}

/**
 * The commission a protected order paid inside its application fee, invoiced
 * on its own at `completed` (series `C`, `settlement: application_fee`) and
 * born `paid`. `earned` is C′, the commission actually kept net of refunds,
 * as the order's `commission_earned` posting recorded it. The order's own
 * `charge` line — which the weekly run never picks up — is the idempotency
 * key: once it points at an invoice, that invoice is returned. `req` must be
 * inside a transaction, so an aborted invoice releases its number.
 */
export async function issueApplicationFeeInvoice(
	req: PayloadRequest,
	order: Order,
	earned: { commission: number; commissionVat: number },
): Promise<CommissionInvoice | null> {
	const line = await findExistingCharge(req, String(order.id));
	if (!line) {
		req.payload.logger.error(
			{ orderId: order.id },
			"[commission] a completed protected order has no commission line to invoice",
		);
		return null;
	}
	const invoiceId = relationId(line.invoice);
	if (invoiceId) {
		return req.payload.findByID({
			collection: "commission-invoices",
			id: invoiceId,
			depth: 0,
			overrideAccess: true,
			req,
		});
	}
	const shopId = relationId(order.shop);
	if (!shopId) throw new Error(`[commission] order ${order.id} has no shop`);
	const shop = await req.payload.findByID({
		collection: "shops",
		id: shopId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const settings = await getOrderSettings(req.payload);
	const now = new Date();
	const completedAt = order.timestamps?.completedAt ?? now.toISOString();
	const total = earned.commission + earned.commissionVat;
	const invoice = await req.payload.create({
		collection: "commission-invoices",
		overrideAccess: true,
		req,
		data: {
			kind: "invoice",
			invoiceNumber: await nextInvoiceNumber(req, INVOICE_SERIES, now),
			shop: shopId,
			// A one-order invoice: its period is the order's completion. The
			// (shop, periodStart) index binds `mobile_money` invoices only.
			periodStart: completedAt,
			periodEnd: completedAt,
			lines: [String(line.id)],
			ordersCount: 1,
			commissionTotal: earned.commission,
			vatRateBps: settings.vatRateBps,
			vatAmount: earned.commissionVat,
			totalDue: total,
			currency: order.amounts?.currency ?? "XAF",
			status: "paid",
			settlement: "application_fee",
			issuedAt: now.toISOString(),
			dueAt: now.toISOString(),
			paidAt: now.toISOString(),
			sellerSnapshot: sellerSnapshotOf(shop),
			issuerSnapshot: PLATFORM_ISSUER,
		},
	});
	await req.payload.update({
		collection: "commission-lines",
		id: line.id,
		overrideAccess: true,
		req,
		data: { status: "invoiced", invoice: invoice.id },
	});
	return invoice;
}

/**
 * The three moments in an invoice's decline a seller is told about. The
 * `commission-invoice-overdue` workflow takes the stage as its payload, so
 * the names are the workflow's, not this file's.
 */
export type OverdueStage = "due_soon" | "overdue" | "restricted";

/**
 * Daily sweep: marks invoices overdue, sends the dueAt−2d reminder once,
 * restricts a shop after `restrictAfterOverdueDays`, and logs a staff report
 * past 30 days. The log lines stay — an alert pipeline reads them — but each
 * of the three stages a seller must hear about is also returned in `notify`,
 * because the notification itself belongs to the job: this function writes,
 * the job fires the external effect afterwards, the same split
 * `issueCommissionInvoices` already uses. Returning the stage rather than
 * firing it here is also what makes the restriction notifiable at all: a shop
 * id alone cannot name the invoice that caused it.
 */
export async function enforceOverdue(
	payload: Payload,
	now: Date,
): Promise<{
	marked: string[];
	notify: Array<{ invoice: CommissionInvoice; stage: OverdueStage }>;
	reported: string[];
	restricted: string[];
}> {
	const settings = await getOrderSettings(payload);
	const { docs: invoices } = await payload.find({
		collection: "commission-invoices",
		where: { status: { in: ["issued", "overdue"] } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});

	const marked: string[] = [];
	const restricted: string[] = [];
	const reported: string[] = [];
	const notify: Array<{ invoice: CommissionInvoice; stage: OverdueStage }> = [];

	for (const invoice of invoices) {
		if (!invoice.dueAt) continue;
		const dueAt = new Date(invoice.dueAt).getTime();
		const daysOverdue = (now.getTime() - dueAt) / DAY_MS;

		if (
			daysOverdue < 0 &&
			now.getTime() >= dueAt - 2 * DAY_MS &&
			!invoice.dueSoonReminderSentAt
		) {
			payload.logger.info({
				msg: "[commission] due-soon reminder",
				invoiceId: invoice.id,
			});
			await payload.update({
				collection: "commission-invoices",
				id: invoice.id,
				overrideAccess: true,
				data: { dueSoonReminderSentAt: now.toISOString() },
			});
			notify.push({ invoice, stage: "due_soon" });
		}

		if (daysOverdue >= 0 && invoice.status === "issued") {
			await payload.update({
				collection: "commission-invoices",
				id: invoice.id,
				overrideAccess: true,
				data: { status: "overdue" },
			});
			marked.push(String(invoice.id));
			notify.push({ invoice, stage: "overdue" });
		}

		if (daysOverdue >= settings.restrictAfterOverdueDays) {
			const shopId = relationId(invoice.shop);
			if (shopId) {
				const shop = await payload.findByID({
					collection: "shops",
					id: shopId,
					depth: 0,
					overrideAccess: true,
				});
				if (!shop.ordersRestrictedAt) {
					await payload.update({
						collection: "shops",
						id: shopId,
						overrideAccess: true,
						context: SHOP_SERVICE_CONTEXT,
						data: {
							ordersRestrictedAt: now.toISOString(),
							ordersRestrictedReason: "commission_overdue",
						},
					});
					restricted.push(shopId);
					notify.push({ invoice, stage: "restricted" });
				}
				if (!invoice.restrictedAt) {
					await payload.update({
						collection: "commission-invoices",
						id: invoice.id,
						overrideAccess: true,
						data: { restrictedAt: now.toISOString() },
					});
				}
			}
		}

		if (daysOverdue >= 30) {
			payload.logger.error({
				msg: "[commission] shop reported: commission invoice is 30+ days overdue",
				invoiceId: invoice.id,
				shopId: relationId(invoice.shop),
			});
			reported.push(String(invoice.id));
		}
	}

	return { marked, notify, reported, restricted };
}

/**
 * Starts (or resumes) the NotchPay checkout for an invoice's `totalDue`.
 * Mirrors `startBoostPurchase`'s two-phase shape: the intent is created
 * inside its own transaction, the provider call happens outside any
 * transaction (a network call must never hold one open), and the intent's
 * move to `pending` is a second, short transaction. No in-app return route
 * is created — the existing NotchPay webhook settles it, exactly like boost.
 */
export async function payInvoice(
	payload: Payload,
	user: ServiceUser,
	invoiceId: string,
	now: Date = new Date(),
): Promise<{ checkoutUrl: string }> {
	const invoice = await payload
		.findByID({
			collection: "commission-invoices",
			id: invoiceId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!invoice) {
		throw new ServiceError(ERROR_CODES.commissionInvoiceNotFound, 404);
	}
	const shopId = relationId(invoice.shop);
	if (!shopId) {
		throw new ServiceError(ERROR_CODES.commissionInvoiceNotFound, 404);
	}
	// `payments.view` is owner/manager, deliberately not `payments.manage`
	// (owner-only) — any member who can see the money can pay it off.
	await requireShopPermission(payload, user, shopId, "payments.view");

	if (invoice.status === "paid") {
		throw new ServiceError(ERROR_CODES.commissionAlreadyPaid, 409);
	}
	// Only money that is still owed is payable. A waived or void invoice was
	// written off by the platform; accepting a payment against it would charge
	// a seller for a debt that no longer exists, with the ledger saying both.
	if (invoice.status !== "issued" && invoice.status !== "overdue") {
		throw new ServiceError(ERROR_CODES.commissionNotPayable, 409);
	}

	// One intent per attempt (`commission:{invoiceId}:{attemptNo}`): the key is
	// unique, so a single key per invoice made every attempt after a failed or
	// expired one collide with it and the invoice could never be paid.
	const { docs: attempts } = await payload.find({
		collection: "payment-intents",
		where: {
			and: [
				{ purpose: { equals: "commission" } },
				{ targetId: { equals: String(invoice.id) } },
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
	const idempotencyKey = `commission:${invoice.id}:${attempts.length + 1}`;

	const totalDue = invoice.totalDue ?? 0;
	const currency = invoice.currency ?? "XAF";
	const intent = await withTransaction(payload, (req) =>
		createPaymentIntent(
			payload,
			{
				purpose: "commission",
				targetType: "commission-invoice",
				targetId: String(invoice.id),
				customerId: user.id,
				amount: totalDue,
				currency,
				provider: "notchpay",
				idempotencyKey,
				now,
			},
			req,
		),
	);

	const serverUrl = process.env.PAYLOAD_PUBLIC_SERVER_URL ?? "";
	let checkout: { checkoutUrl?: string; providerReference: string };
	try {
		checkout = await getProvider("notchpay").createPayment({
			reference: String(intent.reference),
			amount: totalDue,
			currency,
			description: `Commission BuyNSellem ${invoice.invoiceNumber}`,
			callbackUrl: new URL(
				NOTCHPAY_SETTLEMENT_CALLBACK_PATH,
				serverUrl,
			).toString(),
			customer: { email: user.email ?? "", name: user.name ?? undefined },
		});
	} catch (error) {
		payload.logger.error({
			msg: "[commission] provider refused to create the payment",
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

/**
 * Registered as `PURPOSE_HANDLERS.commission.onSucceeded`, so it takes the
 * `(payload, intent, req: TxReq)` shape every purpose handler does — not
 * `req.payload`, because `TxReq` is `Partial<PayloadRequest>` and `payload`
 * is passed alongside it everywhere else in that registry (`attemptStatus`,
 * `activateBoostPayment`). By the time this runs, `attemptStatus`
 * (`services/payments.ts`) has already compared the provider's reported
 * amount against `intent.amount`: a mismatch is turned into
 * `amount_mismatch` and never reaches a purpose handler at all, which is
 * what keeps a mis-settled invoice unpaid (P0's rule, re-used, not
 * re-implemented).
 */
export async function applyCommissionSettlement(
	payload: Payload,
	intent: PaymentIntent,
	req?: TxReq,
): Promise<void> {
	const invoice = await payload.findByID({
		collection: "commission-invoices",
		id: intent.targetId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (invoice.status === "paid") return;

	const paid = await payload.update({
		collection: "commission-invoices",
		id: invoice.id,
		overrideAccess: true,
		req,
		data: { status: "paid", paidAt: new Date().toISOString() },
	});
	const notify = () =>
		notifyCommissionInvoicePaid(payload, paid).catch((err: unknown) =>
			payload.logger.error(
				{ err, invoiceId: paid.id },
				"[commission] paid notification failed",
			),
		);
	if (!onCommit(commitContextOf(req ?? {}), notify)) void notify();

	const shopId = relationId(invoice.shop);
	if (!shopId) return;
	const shop = await payload.findByID({
		collection: "shops",
		id: shopId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (shop.ordersRestrictedReason === "commission_overdue") {
		const { totalDocs } = await payload.count({
			collection: "commission-invoices",
			where: {
				and: [
					{ shop: { equals: shopId } },
					{ status: { equals: "overdue" } },
					{ id: { not_equals: String(invoice.id) } },
				],
			},
			req,
			overrideAccess: true,
		});
		if (totalDocs === 0) {
			await payload.update({
				collection: "shops",
				id: shopId,
				overrideAccess: true,
				context: SHOP_SERVICE_CONTEXT,
				req,
				data: { ordersRestrictedAt: null, ordersRestrictedReason: null },
			});
		}
	}

	payload.logger.info({
		msg: "[commission] invoice paid",
		invoiceId: invoice.id,
		shopId,
	});
}

/** Staff-only: writes the waiver and its `ModerationLog` entry (with every
 * waived line's order number) in the same transaction. */
export async function waiveInvoice(
	payload: Payload,
	actor: Actor,
	invoiceId: string,
	note: string,
): Promise<CommissionInvoice> {
	if (!isModerator(actor)) {
		throw new ModerationError(ERROR_CODES.moderationForbidden, 403);
	}
	if (!note || !note.trim()) {
		throw new ModerationError(ERROR_CODES.moderationReasonRequired, 400);
	}

	return withTransaction(payload, async (req) => {
		const invoice = await req.payload.findByID({
			collection: "commission-invoices",
			id: invoiceId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (invoice.status === "paid") {
			throw new ServiceError(ERROR_CODES.commissionAlreadyPaid, 409);
		}

		const lineIds = (invoice.lines ?? []).flatMap((line) => {
			const id = relationId(line);
			return id ? [id] : [];
		});
		const lines = await Promise.all(
			lineIds.map((id) =>
				req.payload
					.findByID({
						collection: "commission-lines",
						id,
						depth: 0,
						overrideAccess: true,
						req,
					})
					.catch(() => null),
			),
		);
		const orderNumbers = (
			await Promise.all(
				lines.flatMap((line) => {
					if (!line) return [];
					const orderId = relationId(line.order);
					if (!orderId) return [];
					return [
						req.payload
							.findByID({
								collection: "orders",
								id: orderId,
								depth: 0,
								overrideAccess: true,
								req,
							})
							.then((order) => order.orderNumber)
							.catch(() => null),
					];
				}),
			)
		).filter((value): value is string => typeof value === "string");

		const updated = await req.payload.update({
			collection: "commission-invoices",
			id: invoiceId,
			overrideAccess: true,
			req,
			data: { status: "waived", waivedBy: actor.id, waivedNote: note },
		});

		for (const id of lineIds) {
			await req.payload.update({
				collection: "commission-lines",
				id,
				overrideAccess: true,
				req,
				data: { status: "waived" },
			});
		}

		await req.payload.create({
			collection: "moderation-log",
			overrideAccess: true,
			context: { moderationAction: true },
			req,
			data: {
				actor: actor.id,
				actorRole: actor.role ?? "user",
				action: "commission.waive",
				targetType: "commission-invoice",
				targetId: String(invoiceId),
				note,
				metadata: { orderNumbers },
			},
		});

		return updated;
	});
}

/** Resolves a commission-invoice's lines to the order numbers and amounts the
 * document and the billing view both show; a `carry_over` line (no order)
 * falls back to its own kind as the label. */
export async function resolveInvoiceLineViews(
	payload: Payload,
	invoice: CommissionInvoice,
): Promise<InvoiceLineView[]> {
	const lineIds = (invoice.lines ?? []).flatMap((line) => {
		const id = relationId(line);
		return id ? [id] : [];
	});
	const lines = await Promise.all(
		lineIds.map((id) =>
			payload
				.findByID({
					collection: "commission-lines",
					id,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null),
		),
	);
	return Promise.all(
		lines.flatMap((line) => {
			if (!line) return [];
			const base = {
				baseAmount: line.baseAmount ?? 0,
				amount: line.amount,
				kind: line.kind,
			};
			const orderId = relationId(line.order);
			if (!orderId)
				return [Promise.resolve({ ...base, orderNumber: line.kind })];
			return [
				payload
					.findByID({
						collection: "orders",
						id: orderId,
						depth: 0,
						overrideAccess: true,
					})
					.then((order) => ({ ...base, orderNumber: order.orderNumber }))
					.catch(() => ({ ...base, orderNumber: line.kind })),
			];
		}),
	);
}

/**
 * The shop billing screen's one read: every invoice (newest first), the
 * still-accruing current week, and whether the shop is restricted. Current
 * week bounds are derived from `weekBoundsDouala`'s *last complete* week
 * rather than re-deriving the `Africa/Douala` boundary a second time.
 */
export async function getBillingView(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
	now: Date = new Date(),
): Promise<BillingView> {
	await requireShopPermission(payload, user, shopId, "payments.view");

	const { docs: invoices } = await payload.find({
		collection: "commission-invoices",
		where: { shop: { equals: shopId } },
		sort: "-issuedAt",
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});

	const invoiceViews = await Promise.all(
		invoices.map(async (invoice) => ({
			id: String(invoice.id),
			invoiceNumber: invoice.invoiceNumber,
			periodStart: invoice.periodStart ?? "",
			periodEnd: invoice.periodEnd ?? "",
			ordersCount: invoice.ordersCount ?? 0,
			commissionTotal: invoice.commissionTotal ?? 0,
			vatAmount: invoice.vatAmount ?? 0,
			totalDue: invoice.totalDue ?? 0,
			currency: "XAF" as const,
			status: invoice.status ?? "issued",
			issuedAt: invoice.issuedAt ?? "",
			dueAt: invoice.dueAt ?? "",
			paidAt: invoice.paidAt ?? null,
			lines: await resolveInvoiceLineViews(payload, invoice),
		})),
	);

	const lastWeek = weekBoundsDouala(now);
	const currentStart = new Date(
		new Date(lastWeek.periodEnd).getTime() + 1,
	).toISOString();
	const currentEnd = new Date(
		new Date(currentStart).getTime() + 7 * DAY_MS - 1,
	).toISOString();

	const { docs: openLines } = await payload.find({
		collection: "commission-lines",
		where: {
			and: [
				{ shop: { equals: shopId } },
				{ kind: { equals: "charge" } },
				{ status: { equals: "open" } },
				{ accruedAt: { greater_than_equal: currentStart } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const accrued = openLines.reduce((sum, line) => sum + line.amount, 0);
	const ordersCount = new Set(
		openLines.flatMap((line) => {
			const orderId = relationId(line.order);
			return orderId ? [orderId] : [];
		}),
	).size;

	const shop = await payload.findByID({
		collection: "shops",
		id: shopId,
		depth: 0,
		overrideAccess: true,
	});
	const restricted = shop.ordersRestrictedAt
		? {
				since: shop.ordersRestrictedAt,
				reason: shop.ordersRestrictedReason ?? "commission_overdue",
			}
		: null;

	return {
		invoices: invoiceViews,
		currentPeriod: {
			periodStart: currentStart,
			periodEnd: currentEnd,
			accrued,
			ordersCount,
		},
		restricted,
	};
}

export { renderInvoiceHtml } from "../lib/commissionInvoiceDocument";

export const COMMISSION_REFUND_CREDIT_REASON = "commission_refund_credit";

export interface CommissionCreditSource {
	order: Order;
	refundedGoods: number;
	sourceType: "dispute" | "return-case";
	sourceId: string;
}

/**
 * Hands back the commission share of refunded goods on a COD order, once per
 * source. An uninvoiced charge is netted by the next weekly run; an invoiced
 * one gets a series-A credit note at the invoice's own VAT rate, and the
 * credit line nets on the following invoice. A protected order's commission
 * is reversed by P5's ledger, so it never gets a second credit here.
 */
export async function issueCommissionCredit(
	req: PayloadRequest,
	input: CommissionCreditSource,
	now = new Date(),
): Promise<CommissionLine | null> {
	if (input.order.paymentMethod !== "cod") return null;
	const orderId = String(input.order.id);
	const charge = await findExistingCharge(req, orderId);
	if (!charge || !charge.baseAmount || !charge.shop) return null;

	const { docs: existing } = await req.payload.find({
		collection: "commission-lines",
		where: {
			and: [
				{ order: { equals: orderId } },
				{ kind: { equals: "credit" } },
				{ reason: { equals: COMMISSION_REFUND_CREDIT_REASON } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const replay = existing.find(
		(line) =>
			line.sourceType === input.sourceType && line.sourceId === input.sourceId,
	);
	if (replay) return replay;

	const chargeInvoiceId =
		charge.status === "invoiced" ? relationId(charge.invoice) : null;
	const original = chargeInvoiceId
		? await req.payload.findByID({
				collection: "commission-invoices",
				id: chargeInvoiceId,
				depth: 0,
				overrideAccess: true,
				req,
			})
		: null;
	const settings = await getOrderSettings(req.payload);
	const share = commissionCredit({
		commissionHt: charge.amount,
		refundedGoods: Math.min(input.refundedGoods, charge.baseAmount),
		commissionBase: charge.baseAmount,
		vatRateBps: original?.vatRateBps ?? settings.vatRateBps,
	});
	const alreadyCredited = existing.reduce((sum, line) => sum + line.amount, 0);
	const creditHt = Math.min(share.creditHt, charge.amount - alreadyCredited);
	if (creditHt <= 0) return null;

	const line = await req.payload.create({
		collection: "commission-lines",
		req,
		overrideAccess: true,
		data: {
			shop: relationId(charge.shop) ?? "",
			order: orderId,
			kind: "credit",
			paymentMethod: "cod",
			baseAmount: Math.min(input.refundedGoods, charge.baseAmount),
			amount: creditHt,
			reason: COMMISSION_REFUND_CREDIT_REASON,
			status: "open",
			accruedAt: now.toISOString(),
			sourceType: input.sourceType,
			sourceId: input.sourceId,
		},
	});
	if (original) {
		const vatRateBps = original.vatRateBps ?? settings.vatRateBps;
		const vatAmount = vatOf(creditHt, vatRateBps);
		const shop = await req.payload.findByID({
			collection: "shops",
			id: relationId(charge.shop) ?? "",
			depth: 0,
			overrideAccess: true,
			req,
		});
		await req.payload.create({
			collection: "commission-invoices",
			req,
			overrideAccess: true,
			data: {
				kind: "credit_note",
				invoiceNumber: await nextInvoiceNumber(req, "A", now),
				creditsInvoice: String(original.id),
				sourceType: input.sourceType,
				sourceId: input.sourceId,
				shop: relationId(charge.shop) ?? "",
				lines: [String(line.id)],
				ordersCount: 1,
				commissionTotal: creditHt,
				vatRateBps,
				vatAmount,
				totalDue: 0,
				currency: "XAF",
				status: "void",
				issuedAt: now.toISOString(),
				sellerSnapshot: sellerSnapshotOf(shop),
				issuerSnapshot: PLATFORM_ISSUER,
			},
		});
	}
	return line;
}
