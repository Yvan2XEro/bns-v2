import type { Payload, PayloadRequest } from "payload";
import { isModerator } from "../access/roles";
import { PAYOUT_METHOD_CHANNELS } from "../collections/PayoutAccounts";
import type { ResellerFinanceView } from "../contracts/resale";
import { ERROR_CODES } from "../lib/errors";
import { getOrderSettings } from "../lib/orderSettings";
import { getPaymentSettings, missingGates } from "../lib/paymentSettings";
import { getNotchPayProvider } from "../lib/payments";
import type { TransferEvent } from "../lib/payments/marketplace";
import { relationId } from "../lib/relationId";
import { getResaleSettings } from "../lib/resaleSettings";
import { ServiceError } from "../lib/serviceError";
import { withTransaction } from "../lib/transactions";
import type { ResellerPayout } from "../payload-types";
import { activeHolds } from "./payoutHolds";
import {
	postCommissionPayable,
	postPayoutOutcome,
	postPayoutSubmitted,
} from "./resellerLedger";
import { planResellerPayout } from "./resellerPayoutPlanner";
import { nextNumber } from "./sequences";
import { requireShopPermission } from "./shopGuards";
import type { ServiceUser } from "./shops";

const PAYOUT_CONTEXT = { resellerPayoutService: true } as const;
const idOf = (value: unknown) => relationId(value) ?? "";

const ACTIVE_RETURN_STATUSES = [
	"requested",
	"approved",
	"awaiting_shipment",
	"in_transit",
	"received",
	"inspected",
	"disputed",
	"refund_pending",
] as const;

export async function getResellerFinance(
	payload: Payload,
	user: ServiceUser,
	shopId: string,
): Promise<ResellerFinanceView> {
	await requireShopPermission(payload, user, shopId, "payments.view");
	const [commissions, charges, payouts, accounts] = await Promise.all([
		payload.find({
			collection: "reseller-commissions",
			where: { resellerShop: { equals: shopId } },
			sort: "-createdAt",
			limit: 100,
			depth: 0,
			overrideAccess: true,
		}),
		payload.find({
			collection: "reseller-charges",
			where: { resellerShop: { equals: shopId } },
			sort: "-createdAt",
			limit: 100,
			depth: 0,
			overrideAccess: true,
		}),
		payload.find({
			collection: "reseller-payouts",
			where: { resellerShop: { equals: shopId } },
			sort: "-createdAt",
			limit: 100,
			depth: 0,
			overrideAccess: true,
		}),
		payload.find({
			collection: "payout-accounts",
			where: {
				and: [{ shop: { equals: shopId } }, { status: { equals: "active" } }],
			},
			limit: 1,
			depth: 0,
			overrideAccess: true,
		}),
	]);
	return {
		commissions: commissions.docs.map((commission) => ({
			id: String(commission.id),
			purchaseOrder: idOf(commission.purchaseOrder),
			amount: commission.amount,
			status: commission.status,
			createdAt: commission.createdAt,
		})),
		charges: charges.docs.map((charge) => ({
			id: String(charge.id),
			purchaseOrder: relationId(charge.purchaseOrder),
			amount: charge.amount,
			status: charge.status,
			createdAt: charge.createdAt,
		})),
		payouts: payouts.docs.map((payout) => ({
			id: String(payout.id),
			reference: payout.reference,
			grossAmount: payout.grossAmount,
			offsetAmount: payout.offsetAmount,
			amount: payout.amount,
			fee: payout.fee,
			status: payout.status,
			createdAt: payout.createdAt,
		})),
		accountRequired: !accounts.docs.some(
			(account) => account.method !== "bank",
		),
	};
}

export interface PayResellerCommissionsResult {
	created: string[];
	submitted: string[];
	skipped: Array<{ shop: string; reason: string }>;
}

function payoutWeekStart(now: Date): string {
	const monday = new Date(now);
	monday.setUTCHours(0, 0, 0, 0);
	monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
	return monday.toISOString();
}

export async function releaseResellerCommissions(
	payload: Payload,
	now = new Date(),
): Promise<string[]> {
	const candidates = await payload.find({
		collection: "reseller-commissions",
		where: { status: { equals: "accrued" } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const orderSettings = await getOrderSettings(payload);
	const released: string[] = [];
	for (const candidate of candidates.docs) {
		const orderId = relationId(candidate.order);
		if (!orderId) continue;
		const outcome = await withTransaction(payload, async (req) => {
			const current = await req.payload.findByID({
				collection: "reseller-commissions",
				id: String(candidate.id),
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (current.status !== "accrued") return false;
			const order = await req.payload.findByID({
				collection: "orders",
				id: orderId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			const deliveredAt = order.timestamps?.deliveredAt;
			const withdrawalEndsAt = deliveredAt
				? Date.parse(deliveredAt) + orderSettings.withdrawalDays * 86_400_000
				: Number.NaN;
			if (
				order.status !== "completed" ||
				order.completionHold ||
				!Number.isFinite(withdrawalEndsAt) ||
				now.getTime() < withdrawalEndsAt
			) {
				return false;
			}
			const [returns, disputes, marginLines] = await Promise.all([
				req.payload.find({
					collection: "return-cases",
					where: {
						and: [
							{ order: { equals: orderId } },
							{ status: { in: [...ACTIVE_RETURN_STATUSES] } },
						],
					},
					limit: 1,
					depth: 0,
					overrideAccess: true,
					req,
				}),
				req.payload.find({
					collection: "disputes",
					where: {
						and: [
							{ order: { equals: orderId } },
							{
								status: {
									in: [
										"open",
										"awaiting_seller",
										"awaiting_buyer",
										"under_review",
									],
								},
							},
						],
					},
					limit: 1,
					depth: 0,
					overrideAccess: true,
					req,
				}),
				req.payload.find({
					collection: "commission-lines",
					where: {
						and: [
							{ order: { equals: orderId } },
							{ kind: { equals: "resale_margin" } },
						],
					},
					limit: 1,
					depth: 0,
					overrideAccess: true,
					req,
				}),
			]);
			if (returns.docs.length || disputes.docs.length) return false;
			const marginLine = marginLines.docs[0];
			const invoiceId = marginLine ? relationId(marginLine.invoice) : null;
			if (!invoiceId) return false;
			const invoice = await req.payload.findByID({
				collection: "commission-invoices",
				id: invoiceId,
				depth: 0,
				overrideAccess: true,
				req,
			});
			if (invoice.status !== "paid") return false;
			const payable = await req.payload.update({
				collection: "reseller-commissions",
				id: String(current.id),
				overrideAccess: true,
				req,
				data: { status: "payable", holdReasons: [] },
			});
			await postCommissionPayable(req, payable);
			return true;
		});
		if (outcome) released.push(String(candidate.id));
	}
	return released;
}

async function isNewReseller(
	payload: Payload,
	shopId: string,
	now: Date,
	req: PayloadRequest,
): Promise<boolean> {
	const completed = await payload.find({
		collection: "reseller-commissions",
		where: {
			and: [
				{ resellerShop: { equals: shopId } },
				{ status: { in: ["payable", "paid", "held"] } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (completed.docs.length < 10) return true;
	const orders = await Promise.all(
		completed.docs.map((commission) =>
			payload.findByID({
				collection: "orders",
				id: idOf(commission.order),
				depth: 0,
				overrideAccess: true,
				req,
			}),
		),
	);
	const firstCompletedAt = orders
		.map((order) => order.timestamps?.completedAt)
		.filter((value): value is string => Boolean(value))
		.sort()[0];
	return (
		!firstCompletedAt ||
		now.getTime() - Date.parse(firstCompletedAt) < 30 * 86_400_000
	);
}

async function createPayoutForShop(
	payload: Payload,
	shopId: string,
	now: Date,
): Promise<ResellerPayout | null> {
	const reference = await nextNumber(payload, "RP", now);
	return withTransaction(payload, async (req) => {
		const paymentSettings = await getPaymentSettings(payload);
		if (
			!paymentSettings.gates.some((gate) => gate.gate === "G6" && gate.evidence)
		) {
			return null;
		}
		if ((await activeHolds(payload, { shop: shopId }, req)).length > 0)
			return null;
		const [accounts, commissions, charges] = await Promise.all([
			payload.find({
				collection: "payout-accounts",
				where: {
					and: [{ shop: { equals: shopId } }, { status: { equals: "active" } }],
				},
				limit: 1,
				depth: 0,
				overrideAccess: true,
				req,
			}),
			payload.find({
				collection: "reseller-commissions",
				where: {
					and: [
						{ resellerShop: { equals: shopId } },
						{ status: { equals: "payable" } },
					],
				},
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			}),
			payload.find({
				collection: "reseller-charges",
				where: {
					and: [
						{ resellerShop: { equals: shopId } },
						{ status: { equals: "open" } },
					],
				},
				limit: 0,
				pagination: false,
				depth: 0,
				overrideAccess: true,
				req,
			}),
		]);
		const account = accounts.docs[0];
		if (!account || account.method === "bank") return null;
		const available = commissions.docs.filter(
			(commission) => !relationId(commission.payout),
		);
		const openCharges = charges.docs.filter(
			(charge) => !relationId(charge.offsetBy),
		);
		const settings = await getResaleSettings(payload);
		const capApplies = await isNewReseller(payload, shopId, now, req);
		const weekStart = payoutWeekStart(now);
		const weeklyPayouts = await payload.find({
			collection: "reseller-payouts",
			where: {
				and: [
					{ resellerShop: { equals: shopId } },
					{ createdAt: { greater_than_equal: weekStart } },
					{
						status: {
							in: [
								"scheduled",
								"awaiting_approval",
								"pending",
								"sent",
								"processing",
								"complete",
							],
						},
					},
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		});
		const alreadyPaidThisWeek = weeklyPayouts.docs.reduce(
			(total, payout) => total + payout.grossAmount,
			0,
		);
		const plan = planResellerPayout({
			commissions: available.map((commission) => ({
				id: String(commission.id),
				amount: commission.amount,
				createdAt: commission.createdAt,
			})),
			charges: openCharges.map((charge) => ({
				id: String(charge.id),
				amount: charge.amount,
				createdAt: charge.createdAt,
			})),
			weeklyCap: Math.max(
				0,
				settings.newResellerWeeklyCap - alreadyPaidThisWeek,
			),
			minimum: settings.minPayout,
			capApplies,
		});
		if (plan.skipped || !plan.commissionIds.length) return null;
		const status =
			plan.amount > settings.payoutApprovalAbove
				? "awaiting_approval"
				: "pending";
		const payout = await payload.create({
			collection: "reseller-payouts",
			overrideAccess: true,
			context: PAYOUT_CONTEXT,
			req,
			data: {
				reference,
				resellerShop: shopId,
				payoutAccount: account.id,
				commissions: plan.commissionIds,
				charges: plan.chargeIds,
				grossAmount: plan.grossAmount,
				offsetAmount: plan.offsetAmount,
				amount: plan.amount,
				fee: plan.fee,
				status,
				statusHistory: [{ status, source: "system", at: now.toISOString() }],
			},
		});
		await postPayoutSubmitted(req, payout);
		for (const commissionId of plan.commissionIds) {
			await payload.update({
				collection: "reseller-commissions",
				id: commissionId,
				overrideAccess: true,
				req,
				data: { payout: payout.id },
			});
		}
		for (const chargeId of plan.chargeIds) {
			await payload.update({
				collection: "reseller-charges",
				id: chargeId,
				overrideAccess: true,
				req,
				data: { status: "offset", offsetBy: payout.id },
			});
		}
		return payout;
	});
}

export async function submitResellerPayout(
	payload: Payload,
	payoutRef: string,
): Promise<boolean> {
	const payout = await payload.find({
		collection: "reseller-payouts",
		where: { reference: { equals: payoutRef } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const row = payout.docs[0];
	if (!row || row.status !== "pending" || row.providerTransferId) return false;
	const account = await payload.findByID({
		collection: "payout-accounts",
		id: idOf(row.payoutAccount),
		depth: 0,
		overrideAccess: true,
	});
	const channel =
		account.method === "bank" ? null : PAYOUT_METHOD_CHANNELS[account.method];
	if (!channel || account.status !== "active") return false;
	const provider = getNotchPayProvider();
	const transfer = await provider.createTransfer({
		reference: row.reference,
		amount: row.amount,
		currency: "XAF",
		channel,
		phone: account.accountNumber,
		name: account.accountName,
		idempotencyKey: `reseller-payout:${row.id}`,
	});
	await withTransaction(payload, async (req) => {
		const current = await req.payload.findByID({
			collection: "reseller-payouts",
			id: row.id,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (current.status !== "pending") return;
		await req.payload.update({
			collection: "reseller-payouts",
			id: row.id,
			overrideAccess: true,
			context: PAYOUT_CONTEXT,
			req,
			data: {
				status: "sent",
				providerTransferId: transfer.transferId,
				statusHistory: [
					...(current.statusHistory ?? []),
					{ status: "sent", source: "notchpay", at: new Date().toISOString() },
				],
			},
		});
	});
	return true;
}

export async function payResellerCommissions(
	payload: Payload,
	options: { now?: Date } = {},
): Promise<PayResellerCommissionsResult> {
	const now = options.now ?? new Date();
	const result: PayResellerCommissionsResult = {
		created: [],
		submitted: [],
		skipped: [],
	};
	const payments = await getPaymentSettings(payload);
	if (missingGates(payments.gates, payments.releaseModel).includes("G6")) {
		return {
			...result,
			skipped: [{ shop: "*", reason: "data_protection_gate" }],
		};
	}
	const candidates = await payload.find({
		collection: "reseller-commissions",
		where: { status: { equals: "payable" } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const shops = new Set(
		candidates.docs
			.filter((commission) => !relationId(commission.payout))
			.map((commission) => relationId(commission.resellerShop))
			.filter((shop): shop is string => shop !== null),
	);
	for (const shopId of shops) {
		try {
			const payout = await createPayoutForShop(payload, shopId, now);
			if (!payout) {
				result.skipped.push({
					shop: shopId,
					reason: "not_eligible_or_below_minimum",
				});
				continue;
			}
			result.created.push(payout.id);
			if (payout.status === "awaiting_approval") continue;
			if (await submitResellerPayout(payload, payout.reference)) {
				result.submitted.push(payout.id);
			}
		} catch (error) {
			payload.logger.error(
				{ err: error, shopId },
				"[reseller-payouts] payout run failed",
			);
			result.skipped.push({ shop: shopId, reason: "payout_submission_failed" });
		}
	}
	return result;
}

export async function retryPendingResellerPayouts(
	payload: Payload,
): Promise<{ submitted: string[]; skipped: string[] }> {
	const pending = await payload.find({
		collection: "reseller-payouts",
		where: {
			and: [
				{ status: { equals: "pending" } },
				{ providerTransferId: { exists: false } },
			],
		},
		limit: 100,
		depth: 0,
		overrideAccess: true,
	});
	const result = { submitted: [] as string[], skipped: [] as string[] };
	for (const payout of pending.docs) {
		try {
			if (await submitResellerPayout(payload, payout.reference)) {
				result.submitted.push(String(payout.id));
			} else {
				result.skipped.push(String(payout.id));
			}
		} catch (error) {
			payload.logger.error(
				{ err: error, payoutId: payout.id },
				"[reseller-payouts] pending transfer retry failed",
			);
			result.skipped.push(String(payout.id));
		}
	}
	return result;
}

export async function applyResellerPayoutEvent(
	req: PayloadRequest,
	event: TransferEvent,
): Promise<"unknown_payout" | "unchanged" | "applied"> {
	if (!event.reference?.startsWith("RP-")) return "unknown_payout";
	const found = await req.payload.find({
		collection: "reseller-payouts",
		where: { reference: { equals: event.reference } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const payout = found.docs[0];
	if (!payout) return "unknown_payout";
	const status = event.status;
	if (payout.status === status) return "unchanged";
	const allowed: Partial<Record<ResellerPayout["status"], readonly string[]>> =
		{
			pending: ["sent", "processing", "complete", "failed"],
			sent: ["processing", "complete", "failed"],
			processing: ["complete", "failed"],
			complete: ["reversed"],
		};
	if (!allowed[payout.status]?.includes(status)) return "unchanged";
	const nextStatus = status;
	await req.payload.update({
		collection: "reseller-payouts",
		id: payout.id,
		overrideAccess: true,
		context: PAYOUT_CONTEXT,
		req,
		data: {
			status: nextStatus,
			providerTransferId: event.transferId,
			failureReason: status === "failed" ? event.failureReason : null,
			statusHistory: [
				...(payout.statusHistory ?? []),
				{ status: nextStatus, source: "webhook", at: new Date().toISOString() },
			],
		},
	});
	if (status === "complete" || status === "failed" || status === "reversed") {
		await postPayoutOutcome(req, payout, status);
	}
	if (status === "complete") {
		for (const commissionValue of payout.commissions ?? []) {
			const commissionId = idOf(commissionValue);
			await req.payload.update({
				collection: "reseller-commissions",
				id: commissionId,
				overrideAccess: true,
				req,
				data: { status: "paid", paidAt: new Date().toISOString() },
			});
		}
	} else if (status === "failed" || status === "reversed") {
		for (const commissionValue of payout.commissions ?? []) {
			await req.payload.update({
				collection: "reseller-commissions",
				id: idOf(commissionValue),
				overrideAccess: true,
				req,
				data: { status: "payable", payout: null, paidAt: null },
			});
		}
		for (const chargeValue of payout.charges ?? []) {
			await req.payload.update({
				collection: "reseller-charges",
				id: idOf(chargeValue),
				overrideAccess: true,
				req,
				data: { status: "open", offsetBy: null },
			});
		}
	}
	return "applied";
}

export async function requireResellerPayoutApproval(
	payload: Payload,
	user: ServiceUser,
	payoutId: string,
): Promise<ResellerPayout> {
	if (!isModerator(user))
		throw new ServiceError(ERROR_CODES.moderationForbidden, 403);
	return withTransaction(payload, async (req) => {
		const payout = await req.payload.findByID({
			collection: "reseller-payouts",
			id: payoutId,
			depth: 0,
			overrideAccess: true,
			req,
		});
		if (payout.status !== "awaiting_approval") {
			throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
		}
		const approved = await req.payload.update({
			collection: "reseller-payouts",
			id: payout.id,
			overrideAccess: true,
			context: PAYOUT_CONTEXT,
			req,
			data: {
				status: "pending",
				approvedBy: user.id,
				approvedAt: new Date().toISOString(),
				statusHistory: [
					...(payout.statusHistory ?? []),
					{
						status: "pending",
						actor: user.id,
						source: "admin",
						at: new Date().toISOString(),
					},
				],
			},
		});
		return approved;
	});
}

export async function retryResellerPayout(
	payload: Payload,
	user: ServiceUser,
	payoutId: string,
): Promise<{ payout: ResellerPayout; submitted: boolean }> {
	if (!isModerator(user))
		throw new ServiceError(ERROR_CODES.moderationForbidden, 403);
	const payout = await payload.findByID({
		collection: "reseller-payouts",
		id: payoutId,
		depth: 0,
		overrideAccess: true,
	});
	if (payout.status !== "pending" || payout.providerTransferId) {
		throw new ServiceError(ERROR_CODES.purchaseOrderInvalidTransition, 409);
	}
	return {
		payout,
		submitted: await submitResellerPayout(payload, payout.reference),
	};
}
