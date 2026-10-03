import type { Payload, PayloadRequest } from "payload";
import { isModerator } from "../access/roles";
import { BUYER_FEE_INVOICE_FILES_PREFIX } from "../collections/BuyerFeeInvoiceFiles";
import {
	type BuyerFeeDocument,
	renderBuyerFeeDocumentPdf,
} from "../lib/commissionInvoiceDocument";
import { ERROR_CODES } from "../lib/errors";
import { getOrderSettings } from "../lib/orderSettings";
import { getPaymentSettings } from "../lib/paymentSettings";
import { createSignedDocumentUrl } from "../lib/privateFiles";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import { withTransaction } from "../lib/transactions";
import type {
	BuyerFeeInvoice,
	CommissionInvoice,
	Order,
	PaymentIntent,
	Refund,
} from "../payload-types";
import { issueApplicationFeeInvoice, PLATFORM_ISSUER } from "./commission";
import { marketOf } from "./connectedAccounts";
import { transactionLines } from "./ledger";
import { nextInvoiceNumber } from "./sequences";

/** Carried by every write this module makes with `overrideAccess`. */
export const BUYER_FEE_INVOICE_CONTEXT = { buyerFeeInvoices: true } as const;

/** The spec's "signed URLs valid 5 minutes". */
export const BUYER_FEE_INVOICE_URL_TTL_SECONDS = 300;

/** Serves the PDFs under the local storage provider. */
export const BUYER_FEE_INVOICE_FILES_ROUTE = "/api/buyer-fee-invoices/files";

export interface FeeAmounts {
	amountHt: number;
	vat: number;
	amountTtc: number;
}

/** The fee is frozen TTC on the order at placement, its VAT beside it. */
export function feeAmountsOf(order: Pick<Order, "amounts">): FeeAmounts {
	const amountTtc = order.amounts?.buyerProtectionFee ?? 0;
	const vat = order.amounts?.buyerProtectionFeeVat ?? 0;
	return { amountHt: amountTtc - vat, vat, amountTtc };
}

async function findOne(
	req: PayloadRequest,
	and: Array<Record<string, { equals: string }>>,
): Promise<BuyerFeeInvoice | null> {
	const { docs } = await req.payload.find({
		collection: "buyer-fee-invoices",
		where: { and },
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	return docs[0] ?? null;
}

async function loadOrder(req: PayloadRequest, id: string): Promise<Order> {
	return req.payload.findByID({
		collection: "orders",
		id,
		depth: 0,
		overrideAccess: true,
		req,
	});
}

/** The shop's market row decides the rate, as it did when the fee was split. */
async function vatRateOf(req: PayloadRequest, order: Order): Promise<number> {
	const shopId = relationId(order.shop);
	const shop = shopId
		? await req.payload
				.findByID({
					collection: "shops",
					id: shopId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null)
		: null;
	const market = shop
		? marketOf(await getPaymentSettings(req.payload), shop)
		: null;
	return market?.vatRateBps ?? (await getOrderSettings(req.payload)).vatRateBps;
}

async function storePdf(
	req: PayloadRequest,
	document: BuyerFeeDocument,
): Promise<string> {
	const data = renderBuyerFeeDocumentPdf(document);
	const file = await req.payload.create({
		collection: "buyer-fee-invoice-files",
		data: {},
		file: {
			data,
			mimetype: "application/pdf",
			name: `${document.number}.pdf`,
			size: data.length,
		},
		overrideAccess: true,
		context: BUYER_FEE_INVOICE_CONTEXT,
		req,
	});
	return String(file.id);
}

function paidAtOf(intent: PaymentIntent): string {
	const success = intent.statusHistory
		?.filter((entry) => entry.status === "succeeded")
		.at(-1);
	return success?.at ?? intent.updatedAt;
}

/**
 * The buyer protection fee invoice (series `F`) of the order the intent paid:
 * HT, VAT and TTC from the order's frozen fee fields, a bilingual PDF in
 * private storage. One per order: every later call — settlement's replays,
 * the sweep — returns the row already there. Two racing first calls are
 * decided by the unique index on `(order, kind: invoice)`: the loser's
 * transaction aborts, releasing its number, and its next call finds the
 * winner. `req` must be inside a transaction. Null when the order carries no
 * fee.
 */
export async function issueBuyerFeeInvoice(
	req: PayloadRequest,
	order: Order,
	intent: PaymentIntent,
): Promise<BuyerFeeInvoice | null> {
	const orderId = String(order.id);
	const existing = await findOne(req, [
		{ order: { equals: orderId } },
		{ kind: { equals: "invoice" } },
	]);
	if (existing) return existing;

	const amounts = feeAmountsOf(order);
	if (amounts.amountTtc <= 0) return null;

	const issuedAt = new Date();
	const number = await nextInvoiceNumber(req, "F", issuedAt);
	const vatRateBps = await vatRateOf(req, order);
	const buyer = relationId(order.buyer);
	const pdf = await storePdf(req, {
		kind: "invoice",
		number,
		creditsNumber: null,
		issuedAt: issuedAt.toISOString(),
		paidAt: paidAtOf(intent),
		orderNumber: order.orderNumber,
		customerName: order.delivery?.recipientName ?? "",
		...amounts,
		vatRateBps,
		issuer: PLATFORM_ISSUER,
	});
	return req.payload.create({
		collection: "buyer-fee-invoices",
		data: {
			number,
			kind: "invoice",
			order: orderId,
			...(buyer ? { buyer } : {}),
			...amounts,
			vatRateBps,
			pdf,
			issuedAt: issuedAt.toISOString(),
		},
		overrideAccess: true,
		context: BUYER_FEE_INVOICE_CONTEXT,
		req,
	});
}

/**
 * The credit note (series `F`, `kind: credit_note`) mirroring a refund that
 * gave the whole fee back — a partial refund never touches the fee. One per
 * invoice; null when the refund returned no fee. P6 calls it.
 */
export async function creditNoteFor(
	req: PayloadRequest,
	invoice: BuyerFeeInvoice,
	refund: Pick<Refund, "id" | "breakdown">,
): Promise<BuyerFeeInvoice | null> {
	if (invoice.kind !== "invoice") {
		throw new Error(`[buyer-fee-invoices] ${invoice.number} is not an invoice`);
	}
	const refundedFee = refund.breakdown?.buyerProtectionFee ?? 0;
	if (refundedFee === 0) return null;
	if (refundedFee !== invoice.amountTtc) {
		throw new Error(
			`[buyer-fee-invoices] refund ${refund.id} returns ${refundedFee} of a ${invoice.amountTtc} fee; only a full fee refund is credited`,
		);
	}
	const existing = await findOne(req, [
		{ creditsInvoice: { equals: String(invoice.id) } },
		{ kind: { equals: "credit_note" } },
	]);
	if (existing) return existing;

	const orderId = relationId(invoice.order) ?? "";
	const order = await loadOrder(req, orderId);
	const issuedAt = new Date();
	const number = await nextInvoiceNumber(req, "F", issuedAt);
	const amounts: FeeAmounts = {
		amountHt: invoice.amountHt,
		vat: invoice.vat,
		amountTtc: invoice.amountTtc,
	};
	const pdf = await storePdf(req, {
		kind: "credit_note",
		number,
		creditsNumber: invoice.number,
		issuedAt: issuedAt.toISOString(),
		paidAt: null,
		orderNumber: order.orderNumber,
		customerName: order.delivery?.recipientName ?? "",
		...amounts,
		vatRateBps: invoice.vatRateBps,
		issuer: PLATFORM_ISSUER,
	});
	const buyer = relationId(invoice.buyer);
	return req.payload.create({
		collection: "buyer-fee-invoices",
		data: {
			number,
			kind: "credit_note",
			creditsInvoice: String(invoice.id),
			order: orderId,
			...(buyer ? { buyer } : {}),
			...amounts,
			vatRateBps: invoice.vatRateBps,
			pdf,
			issuedAt: issuedAt.toISOString(),
		},
		overrideAccess: true,
		context: BUYER_FEE_INVOICE_CONTEXT,
		req,
	});
}

/**
 * The `completed` commission invoice of a `mobile_money` order (series `C`,
 * `settlement: application_fee`, `status: paid`), for the C′ the order's
 * `commission_earned` posting kept. Called by `services/payouts.ts` after the
 * release posting commits and on every retry of that handler: idempotent per
 * order through its commission line. Null when nothing was earned (refunds
 * took the whole commission back), so no posting exists.
 */
export async function issueApplicationFeeCommissionInvoice(
	req: PayloadRequest,
	order: Order,
): Promise<CommissionInvoice | null> {
	const { docs } = await req.payload.find({
		collection: "ledger-transactions",
		where: {
			and: [
				{ order: { equals: String(order.id) } },
				{ kind: { equals: "commission_earned" } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const posting = docs[0];
	if (!posting) return null;
	const lines = await transactionLines(req, posting);
	const credited = (category: string) =>
		lines
			.filter((line) => line.category === category)
			.reduce((sum, line) => sum + line.credit, 0);
	return issueApplicationFeeInvoice(req, order, {
		commission: credited("platform_revenue_commission"),
		commissionVat: credited("vat_payable"),
	});
}

// ─── Download ────────────────────────────────────────────────────────────────

export interface InvoiceDownloader {
	id: string;
	role?: string | null;
}

/**
 * A 5-minute signed URL to the PDF, for the invoice's buyer and platform
 * staff. Anyone else — the shop included: the fee is a service sold to the
 * buyer — is told the invoice does not exist.
 */
export async function buyerFeeInvoiceDownload(
	payload: Payload,
	user: InvoiceDownloader,
	invoiceId: string,
): Promise<{ url: string; expiresAt: Date }> {
	const invoice = await payload
		.findByID({
			collection: "buyer-fee-invoices",
			id: invoiceId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	const allowed =
		invoice &&
		(relationId(invoice.buyer) === String(user.id) || isModerator(user));
	const fileId = allowed ? relationId(invoice.pdf) : null;
	const file = fileId
		? await payload
				.findByID({
					collection: "buyer-fee-invoice-files",
					id: fileId,
					depth: 0,
					overrideAccess: true,
				})
				.catch(() => null)
		: null;
	if (!file?.filename) throw new ServiceError(ERROR_CODES.notFound, 404);
	return createSignedDocumentUrl(
		{
			id: String(file.id),
			filename: file.filename,
			mimeType: file.mimeType,
			prefix: BUYER_FEE_INVOICE_FILES_PREFIX,
		},
		BUYER_FEE_INVOICE_URL_TTL_SECONDS,
		BUYER_FEE_INVOICE_FILES_ROUTE,
	);
}

// ─── Sweep ───────────────────────────────────────────────────────────────────

/** Leaves settlement's own after-commit issue time to land first. */
export const SWEEP_GRACE_MS = 10 * 60 * 1000;
export const SWEEP_LOOKBACK_DAYS = 30;

/**
 * Settlement issues the invoice after commit and again on every replayed
 * success, but a provider that got its 2xx never replays, and reconciliation
 * only revisits pending intents. So an issue that failed once would stay
 * missing: this finds every order-tagged `charge` (the payment that settled
 * the order) of the last 30 days with no invoice and issues it.
 */
export async function issueMissingBuyerFeeInvoices(
	payload: Payload,
	{ now = new Date(), limit = 100 }: { now?: Date; limit?: number } = {},
): Promise<{ checked: number; issued: number; errors: number }> {
	const stats = { checked: 0, issued: 0, errors: 0 };
	const at = (offsetMs: number) =>
		new Date(now.getTime() - offsetMs).toISOString();
	const { docs: charges } = await payload.find({
		collection: "ledger-transactions",
		where: {
			and: [
				{ kind: { equals: "charge" } },
				{ order: { exists: true } },
				{ occurredAt: { less_than_equal: at(SWEEP_GRACE_MS) } },
				{
					occurredAt: {
						greater_than_equal: at(SWEEP_LOOKBACK_DAYS * 86_400_000),
					},
				},
			],
		},
		sort: "occurredAt",
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const orderIds = [
		...new Set(
			charges.flatMap((c) => {
				const id = relationId(c.order);
				return id ? [id] : [];
			}),
		),
	];
	const { docs: invoiced } =
		orderIds.length > 0
			? await payload.find({
					collection: "buyer-fee-invoices",
					where: {
						and: [{ order: { in: orderIds } }, { kind: { equals: "invoice" } }],
					},
					pagination: false,
					depth: 0,
					overrideAccess: true,
				})
			: { docs: [] };
	const done = new Set(invoiced.map((i) => relationId(i.order)));

	for (const charge of charges) {
		const orderId = relationId(charge.order);
		const intentId = relationId(charge.paymentIntent);
		if (!orderId || !intentId || done.has(orderId)) continue;
		if (stats.checked >= limit) break;
		stats.checked += 1;
		done.add(orderId);
		try {
			const issued = await withTransaction(payload, async (req) => {
				const order = await loadOrder(req, orderId);
				const intent = await req.payload.findByID({
					collection: "payment-intents",
					id: intentId,
					depth: 0,
					overrideAccess: true,
					req,
				});
				return issueBuyerFeeInvoice(req, order, intent);
			});
			if (issued) stats.issued += 1;
		} catch (error) {
			stats.errors += 1;
			payload.logger.error(
				{ err: error, orderId },
				"[buyer-fee-invoices] sweep could not issue an invoice",
			);
		}
	}
	return stats;
}
