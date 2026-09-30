import type { Payload, PayloadRequest, TaskConfig } from "payload";
import type { VerificationStatus } from "../collections/VerificationRequests";
import { peppered } from "../lib/hash";
import { getKycProvider } from "../lib/kyc";
import { withTransaction } from "../lib/transactions";
import { getVerificationSettings } from "../lib/verificationSettings";
import type { ReviewSignal } from "../lib/verificationSignals";
import type { VerificationRequest } from "../payload-types";
import {
	autoApprove,
	computeReviewSignals,
	submitFromVendor,
	VERIFICATION_CONTEXT,
} from "../services/verification";

export interface ProcessKycEventInput {
	webhookEventId: string;
	provider: "didit" | "smileid";
	sessionRef: string;
}

export interface ProcessKycEventResult {
	handled: boolean;
	requestId: string | null;
	status: VerificationStatus | null;
}

const NOOP: ProcessKycEventResult = {
	handled: false,
	requestId: null,
	status: null,
};

const YEAR_MS = 365.25 * 86_400_000;

async function writeKyc(
	req: PayloadRequest,
	request: VerificationRequest,
	kyc: Record<string, unknown>,
	reviewSignals: ReviewSignal[],
): Promise<VerificationRequest> {
	return req.payload.update({
		collection: "verification-requests",
		id: request.id,
		req,
		overrideAccess: true,
		context: VERIFICATION_CONTEXT,
		data: { kyc, reviewSignals } as never,
	});
}

/**
 * Applies one vendor result to the request it belongs to, inside one
 * transaction. Never throws on a request the result no longer applies to —
 * already decided, revoked, or moved on since the session started — so a
 * stale or duplicate delivery is recorded and quietly dropped rather than
 * retried five times against a state that will never change.
 *
 * A request only ever listens to its vendor while it sits in `draft`: that
 * is the one status `startKycSession` will open a session from, so a request
 * no longer in `draft` has either already been carried into the human
 * review pipeline by a prior vendor event or moved on for an unrelated
 * reason (claimed, decided, revoked, expired with its shop). Gating on that
 * single field also makes the guard double as the idempotency check a
 * replayed webhook delivery needs — a repeat with no new decision to record
 * only ever finds the same non-`draft` request and takes it as a no-op.
 */
export async function processKycEvent(
	payload: Payload,
	input: ProcessKycEventInput,
): Promise<ProcessKycEventResult> {
	return withTransaction(payload, async (req) => {
		const found = await req.payload.find({
			collection: "verification-requests",
			depth: 0,
			limit: 1,
			overrideAccess: true,
			req,
			where: { "kyc.sessionRef": { equals: input.sessionRef } },
		});
		const request = found.docs[0] as VerificationRequest | undefined;
		if (!request) return NOOP;
		if (request.status !== "draft") return NOOP;

		const requestId = String(request.id);
		const result = await getKycProvider(input.provider).fetchResult(
			input.sessionRef,
		);

		// `documentNumber` and `dateOfBirth` exist only in this scope. What is
		// written is a peppered hash, the last four digits, and a boolean — the
		// number itself and the date of birth never reach the database, and
		// never reach a log line either.
		const documentNumberHash = result.documentNumber
			? peppered(result.documentNumber.replace(/\s+/g, "").toUpperCase())
			: null;
		const documentNumberLast4 = result.documentNumber
			? result.documentNumber.slice(-4)
			: null;
		const adult = result.dateOfBirth
			? Date.now() - result.dateOfBirth.getTime() >= 18 * YEAR_MS
			: false;

		const kyc = {
			provider: input.provider,
			sessionRef: input.sessionRef,
			status: result.status,
			attempts: request.kyc?.attempts ?? 1,
			decidedAt: new Date().toISOString(),
			documentType: result.documentType,
			documentCountry: result.documentCountry,
			documentNumberHash,
			documentNumberLast4,
			documentExpiresAt: result.documentExpiresAt?.toISOString() ?? null,
			givenNames: result.givenNames,
			familyName: result.familyName,
			adult,
			livenessPassed: result.livenessPassed,
			faceMatchScore: result.faceMatchScore,
			vendorWarnings: result.warnings,
			vendorReviewUrl: result.reviewUrl,
			vendorDataDeletedAt: null,
		};

		const signals = await computeReviewSignals(req, request, {
			kyc: {
				status: result.status,
				givenNames: result.givenNames,
				familyName: result.familyName,
				adult,
				documentNumberHash,
			},
		});

		switch (result.status) {
			case "approved": {
				const updated = await writeKyc(req, request, kyc, signals);
				const moved = await submitFromVendor(req, updated);
				const settings = await getVerificationSettings(payload);
				if (settings.autoApproveIdentity && signals.length === 0) {
					const approved = await autoApprove(req, moved);
					return { handled: true, requestId, status: approved.status };
				}
				return { handled: true, requestId, status: moved.status };
			}
			case "review": {
				const updated = await writeKyc(req, request, kyc, signals);
				const moved = await submitFromVendor(req, updated);
				return { handled: true, requestId, status: moved.status };
			}
			case "declined": {
				const updated = await writeKyc(req, request, kyc, signals);
				// Below three attempts the request stays in `draft`, so the owner
				// can simply start another session. At the third decline a person
				// looks: a rejection is never taken by the machine.
				if ((updated.kyc?.attempts ?? 0) < 3) {
					return { handled: true, requestId, status: "draft" };
				}
				const moved = await submitFromVendor(req, updated);
				return { handled: true, requestId, status: moved.status };
			}
			default: {
				await writeKyc(req, request, kyc, signals);
				return { handled: true, requestId, status: request.status };
			}
		}
	});
}

export const processKycEventTask: TaskConfig<"processKycEvent"> = {
	slug: "processKycEvent",
	retries: 5,
	inputSchema: [
		{ name: "webhookEventId", type: "text", required: true },
		{ name: "provider", type: "text", required: true },
		{ name: "sessionRef", type: "text", required: true },
	],
	outputSchema: [
		{ name: "handled", type: "checkbox" },
		{ name: "requestId", type: "text" },
		{ name: "status", type: "text" },
	],
	handler: async ({ input, req }) => {
		const provider = input.provider === "smileid" ? "smileid" : "didit";
		const output = await processKycEvent(req.payload, {
			webhookEventId: input.webhookEventId,
			provider,
			sessionRef: input.sessionRef,
		});
		return { output };
	},
};
