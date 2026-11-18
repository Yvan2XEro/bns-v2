import type { Payload, PayloadRequest, TaskConfig } from "payload";
import type { VerificationStatus } from "../collections/VerificationRequests";
import { ERROR_CODES } from "../lib/errors";
import { peppered } from "../lib/hash";
import { getKycProvider } from "../lib/kyc";
import { ServiceError } from "../lib/serviceError";
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
	kyc: NonNullable<VerificationRequest["kyc"]>,
	reviewSignals: ReviewSignal[],
): Promise<VerificationRequest> {
	return req.payload.update({
		collection: "verification-requests",
		id: request.id,
		req,
		overrideAccess: true,
		context: VERIFICATION_CONTEXT,
		data: { kyc, reviewSignals },
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
		// never reach a log line either. Both the hash and the last 4 are
		// derived from the same normalised string: a reviewer matches the last 4
		// against the physical document, so slicing the raw (unnormalised)
		// number instead would leave spaces in it, or shift which digits show.
		const normalisedDocumentNumber = result.documentNumber
			? result.documentNumber.replace(/\s+/g, "").toUpperCase()
			: null;
		const documentNumberHash = normalisedDocumentNumber
			? peppered(normalisedDocumentNumber)
			: null;
		const documentNumberLast4 = normalisedDocumentNumber
			? normalisedDocumentNumber.slice(-4)
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

/**
 * Runs `processKycEvent` and decides whether a failure should retry.
 *
 * Kept apart from `TaskConfig.handler` so it can be pinned directly, against
 * a plain `payload` and `logger`, without building the rest of Payload's
 * job-runner shape (`job`, `inlineTask`, `tasks`) that `TaskHandlerArgs`
 * otherwise requires.
 *
 * A missing `VERIFICATION_HASH_PEPPER` is a deploy-time misconfiguration, not
 * a transient vendor hiccup: every one of the 5 configured retries would fail
 * on the exact same condition, which only delays the alert an operator
 * needs. Logged once, at error level, and the job finishes as unhandled
 * instead of looping through them.
 */
export async function runProcessKycEvent(
	payload: Payload,
	logger: Pick<Payload["logger"], "error">,
	input: ProcessKycEventInput,
): Promise<{ output: ProcessKycEventResult }> {
	try {
		const output = await processKycEvent(payload, input);
		return { output };
	} catch (error) {
		if (
			error instanceof ServiceError &&
			error.code === ERROR_CODES.verificationHashUnavailable
		) {
			logger.error(
				{ err: error, sessionRef: input.sessionRef },
				"[verification:processKycEvent] VERIFICATION_HASH_PEPPER is not set; not retrying",
			);
			return { output: NOOP };
		}
		throw error;
	}
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
		return runProcessKycEvent(req.payload, req.payload.logger, {
			webhookEventId: input.webhookEventId,
			provider,
			sessionRef: input.sessionRef,
		});
	},
};
