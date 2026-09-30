import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { KycProvider, KycResult } from "./types";

const DEFAULT_BASE_URL = "https://verification.didit.me";
const WEBHOOK_MAX_AGE_SECONDS = 5 * 60;
/** Didit's create-session response carries no explicit expiry in practice. */
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Never interpolates the secret or the raw signature into its message. */
class DiditWebhookError extends Error {
	constructor() {
		super("Didit webhook verification failed");
		this.name = "DiditWebhookError";
	}
}

function requireEnv(
	name: "DIDIT_API_KEY" | "DIDIT_WEBHOOK_SECRET" | "DIDIT_WORKFLOW_ID",
): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} environment variable is not set`);
	}
	return value;
}

function baseUrl(): string {
	return process.env.DIDIT_BASE_URL ?? DEFAULT_BASE_URL;
}

/**
 * ISO 3166-1 alpha-3 → alpha-2 for the countries a Cameroon-based
 * marketplace realistically verifies documents from (Central/West Africa
 * and the diaspora's main destinations). An unmapped code degrades to
 * `null` rather than a guess.
 */
const ALPHA3_TO_ALPHA2: Record<string, string> = {
	CMR: "CM",
	NGA: "NG",
	GHA: "GH",
	CIV: "CI",
	SEN: "SN",
	TGO: "TG",
	BEN: "BJ",
	GAB: "GA",
	COG: "CG",
	COD: "CD",
	CAF: "CF",
	TCD: "TD",
	GNQ: "GQ",
	MLI: "ML",
	BFA: "BF",
	NER: "NE",
	GIN: "GN",
	GNB: "GW",
	SLE: "SL",
	LBR: "LR",
	MRT: "MR",
	DZA: "DZ",
	MAR: "MA",
	TUN: "TN",
	LBY: "LY",
	EGY: "EG",
	ETH: "ET",
	KEN: "KE",
	TZA: "TZ",
	UGA: "UG",
	RWA: "RW",
	BDI: "BI",
	ZAF: "ZA",
	ZMB: "ZM",
	ZWE: "ZW",
	MOZ: "MZ",
	AGO: "AO",
	NAM: "NA",
	BWA: "BW",
	MWI: "MW",
	SDN: "SD",
	SSD: "SS",
	SOM: "SO",
	DJI: "DJ",
	ERI: "ER",
	MDG: "MG",
	MUS: "MU",
	SYC: "SC",
	CPV: "CV",
	STP: "ST",
	COM: "KM",
	FRA: "FR",
	BEL: "BE",
	DEU: "DE",
	GBR: "GB",
	ITA: "IT",
	ESP: "ES",
	PRT: "PT",
	NLD: "NL",
	CHE: "CH",
	LUX: "LU",
	SWE: "SE",
	NOR: "NO",
	IRL: "IE",
	USA: "US",
	CAN: "CA",
	SAU: "SA",
	ARE: "AE",
	QAT: "QA",
	TUR: "TR",
	CHN: "CN",
	IND: "IN",
	LBN: "LB",
};

const DOCUMENT_TYPE_MAP: Record<string, KycResult["documentType"]> = {
	"Identity Card": "national_id",
	Passport: "passport",
	"Residence Permit": "residence_permit",
};

const STATUS_MAP: Record<string, KycResult["status"]> = {
	Approved: "approved",
	Declined: "declined",
	"In Review": "review",
	Abandoned: "abandoned",
	"Not Started": "pending",
	"In Progress": "pending",
};

const diditIdVerificationSchema = z
	.object({
		document_type: z.string().nullable().optional(),
		issuing_state: z.string().nullable().optional(),
		document_number: z.string().nullable().optional(),
		date_of_birth: z.string().nullable().optional(),
		expiration_date: z.string().nullable().optional(),
		first_name: z.string().nullable().optional(),
		last_name: z.string().nullable().optional(),
	})
	.optional();

const diditLivenessSchema = z
	.object({ status: z.string().nullable().optional() })
	.optional();

const diditFaceMatchSchema = z
	.object({ score: z.number().nullable().optional() })
	.optional();

/**
 * Only the fields this adapter turns into `KycResult` are declared here.
 * `z.object` strips anything else Didit's response carries — document
 * images, address, nationality, e-mail, phone — so those never reach the
 * caller. This schema IS the data-minimisation boundary for the vendor's
 * verification result.
 */
const diditSessionResultSchema = z.object({
	session_id: z.string().optional(),
	status: z.string().optional(),
	id_verification: diditIdVerificationSchema,
	liveness: diditLivenessSchema,
	face_match: diditFaceMatchSchema,
	warnings: z.array(z.string()).optional(),
	review_url: z.string().nullable().optional(),
});

const diditCreateSessionResponseSchema = z.object({
	session_id: z.string(),
	url: z.string(),
	expires_at: z.string().optional(),
});

const diditWebhookEventSchema = z.object({
	session_id: z.string(),
	status: z.string().optional(),
	webhook_id: z.string(),
});

export const diditProvider: KycProvider = {
	id: "didit",

	async createSession(input) {
		const apiKey = requireEnv("DIDIT_API_KEY");
		const workflowId = requireEnv("DIDIT_WORKFLOW_ID");

		const res = await fetch(`${baseUrl()}/v2/session/`, {
			method: "POST",
			headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
			body: JSON.stringify({
				workflow_id: workflowId,
				vendor_data: input.reference,
				callback: input.returnUrl,
				language: input.locale,
			}),
		});
		if (!res.ok) {
			throw new Error(`Didit createSession (${res.status})`);
		}

		const raw: unknown = await res.json();
		const parsed = diditCreateSessionResponseSchema.safeParse(raw);
		if (!parsed.success) {
			throw new Error("Didit createSession: unusable response");
		}

		return {
			sessionRef: parsed.data.session_id,
			url: parsed.data.url,
			expiresAt: parsed.data.expires_at
				? new Date(parsed.data.expires_at)
				: new Date(Date.now() + DEFAULT_SESSION_TTL_MS),
		};
	},

	async verifyWebhook(rawBody, headers) {
		const secret = requireEnv("DIDIT_WEBHOOK_SECRET");

		const signature = headers.get("x-signature");
		const timestampHeader = headers.get("x-timestamp");
		if (!signature || !timestampHeader || !/^[0-9a-f]{64}$/i.test(signature)) {
			throw new DiditWebhookError();
		}

		const timestamp = Number(timestampHeader);
		const nowSeconds = Math.floor(Date.now() / 1000);
		if (
			!Number.isFinite(timestamp) ||
			Math.abs(nowSeconds - timestamp) > WEBHOOK_MAX_AGE_SECONDS
		) {
			throw new DiditWebhookError();
		}

		const expected = createHmac("sha256", secret).update(rawBody).digest();
		const provided = Buffer.from(signature, "hex");
		if (
			provided.length !== expected.length ||
			!timingSafeEqual(provided, expected)
		) {
			throw new DiditWebhookError();
		}

		let raw: unknown;
		try {
			raw = JSON.parse(rawBody);
		} catch {
			throw new DiditWebhookError();
		}
		const parsed = diditWebhookEventSchema.safeParse(raw);
		if (!parsed.success) {
			throw new DiditWebhookError();
		}

		return {
			providerEventId: parsed.data.webhook_id,
			type: parsed.data.status ?? "",
			sessionRef: parsed.data.session_id,
		};
	},

	async fetchResult(sessionRef) {
		const apiKey = requireEnv("DIDIT_API_KEY");

		const res = await fetch(
			`${baseUrl()}/v2/session/${encodeURIComponent(sessionRef)}/decision/`,
			{ headers: { "x-api-key": apiKey } },
		);
		if (!res.ok) {
			throw new Error(`Didit fetchResult (${res.status})`);
		}

		const raw: unknown = await res.json();
		const parsed = diditSessionResultSchema.safeParse(raw);
		const data = parsed.success ? parsed.data : {};
		const idVerification = data.id_verification;

		const documentType = idVerification?.document_type
			? (DOCUMENT_TYPE_MAP[idVerification.document_type] ?? null)
			: null;
		const documentCountry = idVerification?.issuing_state
			? (ALPHA3_TO_ALPHA2[idVerification.issuing_state.toUpperCase()] ?? null)
			: null;

		return {
			status: data.status ? (STATUS_MAP[data.status] ?? "pending") : "pending",
			documentType,
			documentCountry,
			documentNumber: idVerification?.document_number ?? null,
			documentExpiresAt: idVerification?.expiration_date
				? new Date(idVerification.expiration_date)
				: null,
			givenNames: idVerification?.first_name ?? null,
			familyName: idVerification?.last_name ?? null,
			dateOfBirth: idVerification?.date_of_birth
				? new Date(idVerification.date_of_birth)
				: null,
			livenessPassed: data.liveness?.status === "Approved",
			faceMatchScore: data.face_match?.score ?? null,
			warnings: data.warnings ?? [],
			reviewUrl: data.review_url ?? null,
		};
	},

	async deleteSessionData(sessionRef) {
		const apiKey = requireEnv("DIDIT_API_KEY");

		const res = await fetch(
			`${baseUrl()}/v2/session/${encodeURIComponent(sessionRef)}/`,
			{ method: "DELETE", headers: { "x-api-key": apiKey } },
		);
		if (!res.ok && res.status !== 404) {
			throw new Error(`Didit deleteSessionData (${res.status})`);
		}
	},
};
