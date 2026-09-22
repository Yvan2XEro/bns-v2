import { randomUUID } from "node:crypto";
import type { Payload } from "payload";
import { findBoostPrice } from "../lib/boostPricing";
import { ERROR_CODES, type ErrorCode } from "../lib/errors";
import { getProvider } from "../lib/payments";
import type {
	CreatePaymentResult,
	PaymentProvider,
	ProviderName,
} from "../lib/payments/types";
import { relationId } from "../lib/relationId";
import { withTransaction } from "../lib/transactions";
import {
	applyStatus,
	createPaymentIntent,
	findIntentByIdempotencyKey,
	markIntentPending,
} from "./payments";

export class BoostPurchaseError extends Error {
	code: ErrorCode;
	status: number;

	constructor(code: ErrorCode, status: number) {
		super(code);
		this.name = "BoostPurchaseError";
		this.code = code;
		this.status = status;
	}
}

export interface StartBoostPurchaseInput {
	userId: string;
	email: string;
	listingId: unknown;
	duration: unknown;
	providerName: unknown;
	returnUrl?: string;
	idempotencyKey?: string | null;
	serverUrl: string;
	now?: Date;
}

export interface StartBoostPurchaseResult {
	paymentId: string;
	intentId: string;
	provider: ProviderName;
	checkoutUrl: string | null;
	clientSecret: string | null;
}

export function buildCallbackUrl(
	serverUrl: string,
	listingId: string,
	appReturnUrl: string | undefined,
	providerName: ProviderName,
): string {
	const url = new URL("/api/public/boost/callback", serverUrl);
	url.searchParams.set("listingId", listingId);
	url.searchParams.set("provider", providerName);
	if (appReturnUrl) url.searchParams.set("appReturnUrl", appReturnUrl);
	// NotchPay appends &reference=… (its id) and &trxref=… (ours) on redirect.
	return url.toString();
}

export async function startBoostPurchase(
	payload: Payload,
	input: StartBoostPurchaseInput,
	deps: { getProvider: (name: ProviderName) => PaymentProvider } = {
		getProvider,
	},
): Promise<StartBoostPurchaseResult> {
	if (typeof input.listingId !== "string" || !input.listingId) {
		throw new BoostPurchaseError(ERROR_CODES.badRequest, 400);
	}
	const price = findBoostPrice(input.duration);
	if (!price)
		throw new BoostPurchaseError(ERROR_CODES.boostInvalidDuration, 400);
	const providerName: ProviderName =
		input.providerName === "stripe" ? "stripe" : "notchpay";

	const listing = await payload
		.findByID({
			collection: "listings",
			id: input.listingId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!listing) throw new BoostPurchaseError(ERROR_CODES.listingNotFound, 404);
	if (relationId(listing.seller) !== input.userId) {
		throw new BoostPurchaseError(ERROR_CODES.boostNotOwner, 403);
	}
	if (listing.status !== "published") {
		throw new BoostPurchaseError(ERROR_CODES.boostListingNotPublished, 409);
	}

	let provider: PaymentProvider;
	try {
		provider = deps.getProvider(providerName);
	} catch (error) {
		payload.logger.error({
			msg: "[boost] payment provider is not configured",
			provider: providerName,
			err: error,
		});
		throw new BoostPurchaseError(ERROR_CODES.paymentProviderUnavailable, 503);
	}

	const idempotencyKey = `boost:${input.userId}:${input.idempotencyKey || randomUUID()}`;
	const replay = await findIntentByIdempotencyKey(payload, idempotencyKey);
	if (replay) {
		if (replay.status === "pending" && replay.checkoutUrl) {
			return {
				paymentId: replay.targetId,
				intentId: String(replay.id),
				provider: replay.provider,
				checkoutUrl: replay.checkoutUrl,
				clientSecret: null,
			};
		}
		throw new BoostPurchaseError(ERROR_CODES.validation, 409);
	}

	const now = input.now ?? new Date();
	const { boostPaymentId, intent } = await withTransaction(
		payload,
		async (req) => {
			const boost = await payload.create({
				collection: "boost-payments",
				depth: 0,
				overrideAccess: true,
				req,
				data: {
					listing: String(listing.id),
					user: input.userId,
					amount: price.amount,
					duration: String(price.days) as "7" | "14" | "30",
					status: "pending",
					paymentProvider: providerName,
				},
			});
			const created = await createPaymentIntent(
				payload,
				{
					purpose: "boost",
					targetType: "boost-payment",
					targetId: String(boost.id),
					customerId: input.userId,
					amount: price.amount,
					currency: price.currency,
					provider: providerName,
					idempotencyKey,
					now,
				},
				req,
			);
			await payload.update({
				collection: "boost-payments",
				id: boost.id,
				depth: 0,
				overrideAccess: true,
				req,
				data: { paymentIntent: String(created.id) },
			});
			return { boostPaymentId: String(boost.id), intent: created };
		},
	);

	// Outside the transaction: a network call must not hold it open.
	let checkout: CreatePaymentResult;
	try {
		checkout = await provider.createPayment({
			reference: String(intent.reference),
			amount: price.amount,
			currency: price.currency,
			description: `Boost annonce: ${listing.title}`,
			callbackUrl: buildCallbackUrl(
				input.serverUrl,
				String(listing.id),
				input.returnUrl,
				providerName,
			),
			customer: { email: input.email },
		});
	} catch (error) {
		payload.logger.error({
			msg: "[boost] provider refused to create the payment",
			intentId: intent.id,
			err: error,
		});
		await applyStatus(payload, String(intent.id), {
			status: "failed",
			source: "system",
			note: "provider createPayment failed",
		});
		throw new BoostPurchaseError(ERROR_CODES.paymentProviderUnavailable, 502);
	}

	await markIntentPending(payload, String(intent.id), {
		providerReference: checkout.providerReference,
		checkoutUrl: checkout.checkoutUrl ?? null,
	});
	// Legacy fields: released app versions still read them.
	await payload.update({
		collection: "boost-payments",
		id: boostPaymentId,
		depth: 0,
		overrideAccess: true,
		data: {
			paymentReference: checkout.providerReference,
			paymentUrl: checkout.checkoutUrl ?? null,
		},
	});

	return {
		paymentId: boostPaymentId,
		intentId: String(intent.id),
		provider: providerName,
		checkoutUrl: checkout.checkoutUrl ?? null,
		clientSecret: checkout.clientSecret ?? null,
	};
}
