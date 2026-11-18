import { createHmac } from "node:crypto";
import type { Payload, PayloadRequest } from "payload";
import { relationId } from "../lib/relationId";
import { RetryTransaction, withTransaction } from "../lib/transactions";
import type { RiskFlag } from "../payload-types";
import { createHold } from "./payoutHolds";
import { isUniqueViolation } from "./shops";

type SubjectType = RiskFlag["subjectType"];
type Signal = RiskFlag["signal"];

export interface RecordRiskSignalInput {
	subjectType: SubjectType;
	subjectId: string;
	signal: Signal;
	evidence: Record<string, unknown>;
	scoreOverride?: number;
	subjectLabel?: string;
}

const BASE_SCORE: Record<Signal, number> = {
	"velocity.orders_per_phone": 35,
	"velocity.checkout_attempts": 30,
	"velocity.payout_account_changes": 60,
	"velocity.shop_creation": 45,
	"velocity.accounts_per_device": 25,
	"identity.duplicate_document": 80,
	"identity.duplicate_payout_account": 70,
	"orders.seller_cancellation_ratio": 40,
	"orders.dispute_ratio": 55,
	"cod.refusal_streak": 50,
	"cod.refusal_ratio_shop": 45,
	"resale.self_dealing": 85,
	"resale.shared_identity": 60,
	"resale.handover_at_supplier": 55,
	"resale.buyer_concentration": 50,
	"resale.cancellation_pattern": 40,
	"resale.refusal_pattern": 45,
	dispute_lost_seller: 25,
	counterfeit_confirmed: 50,
	refund_overdue: 50,
	seller_no_response: 25,
	unavailable_after_confirmation: 25,
	dispute_abuse_buyer: 25,
	cod_refusal_abuse: 50,
	serial_withdrawal: 25,
	evidence_reused: 50,
	review_extortion: 50,
	resale_collusion_suspected: 50,
	commission_credit_unpaid: 50,
};

function hashSensitiveSubject(value: string): string {
	const secret = process.env.RISK_HASH_SECRET;
	if (!secret || secret.length < 32)
		throw new Error("RISK_HASH_SECRET must contain at least 32 characters.");
	return createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
}

function scoreSeverity(score: number): RiskFlag["severity"] {
	return score >= 70 ? "high" : score >= 40 ? "medium" : "low";
}

function relatedIds(flag: RiskFlag): string[] {
	return (flag.related ?? [])
		.map(relationId)
		.filter((id): id is string => id !== null);
}

async function escalateOwnerShopFlags(
	payload: Payload,
	flag: RiskFlag,
	req?: PayloadRequest,
): Promise<RiskFlag> {
	let shopIds: string[] = [];
	let ownerId: string | null = null;
	if (flag.subjectType === "shop") {
		const subjectRef = flag.subjectRef;
		const shopId =
			subjectRef && typeof subjectRef === "object" && "value" in subjectRef
				? relationId(subjectRef.value)
				: relationId(subjectRef);
		const shop = shopId
			? await payload
					.findByID({
						collection: "shops",
						id: shopId,
						depth: 0,
						overrideAccess: true,
						req,
					})
					.catch(() => null)
			: null;
		ownerId = relationId(shop?.owner);
		if (!ownerId) return flag;
	} else if (flag.subjectType === "user") {
		ownerId = flag.subjectKey;
		const shops = await payload.find({
			collection: "shops",
			where: { owner: { equals: ownerId } },
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
			req,
		});
		shopIds = shops.docs.map((shop) => String(shop.id));
		if (shopIds.length === 0) return flag;
	} else {
		return flag;
	}

	const peers = await payload.find({
		collection: "risk-flags",
		where: {
			and: [
				{ status: { equals: "open" } },
				flag.subjectType === "shop"
					? {
							and: [
								{ score: { greater_than_equal: 70 } },
								{
									subjectType: { equals: "user" },
									subjectKey: { equals: ownerId },
								},
							],
						}
					: {
							subjectType: { equals: "shop" },
							subjectKey: { in: shopIds },
						},
			],
		},
		limit: 100,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (peers.docs.length === 0) return flag;

	let updatedFlag = flag;
	for (const peer of peers.docs) {
		const flagRelated = [
			...new Set([...relatedIds(updatedFlag), String(peer.id)]),
		];
		const peerRelated = [
			...new Set([...relatedIds(peer), String(updatedFlag.id)]),
		];
		await payload.update({
			collection: "risk-flags",
			id: peer.id,
			overrideAccess: true,
			req,
			data: {
				related: peerRelated,
				...(peer.subjectType === "shop" ? { severity: "high" as const } : {}),
			},
		});
		updatedFlag = await payload.update({
			collection: "risk-flags",
			id: updatedFlag.id,
			overrideAccess: true,
			req,
			data: {
				related: flagRelated,
				...(updatedFlag.subjectType === "shop"
					? { severity: "high" as const }
					: {}),
			},
		});
	}
	return updatedFlag;
}

function safeLabel(input: RecordRiskSignalInput, key: string): string | null {
	if (input.subjectType === "phone") return `Phone •••• ${key.slice(-4)}`;
	if (input.subjectType === "device") return `Device •••• ${key.slice(-4)}`;
	return input.subjectLabel?.slice(0, 100) ?? null;
}

const PRIVATE_EVIDENCE_KEY =
	/(phone|device|name|address|document|image|photo|message|email|token|gps|coordinate)/i;
const PHONE_LIKE_VALUE = /\+?\d[\d\s().-]{7,}\d/g;

function minimiseEvidenceValue(value: unknown): unknown {
	if (typeof value === "string")
		return value.replace(PHONE_LIKE_VALUE, "[redacted]");
	if (Array.isArray(value)) {
		return value
			.map(minimiseEvidenceValue)
			.filter((entry) => entry !== undefined);
	}
	if (typeof value !== "object" || value === null) return value;
	return Object.fromEntries(
		Object.entries(value).flatMap(([key, entry]) =>
			PRIVATE_EVIDENCE_KEY.test(key)
				? []
				: [[key, minimiseEvidenceValue(entry)]],
		),
	);
}

function minimiseEvidence(
	value: Record<string, unknown>,
): Record<string, unknown> {
	const minimised = minimiseEvidenceValue(value);
	if (
		typeof minimised !== "object" ||
		minimised === null ||
		Array.isArray(minimised)
	) {
		return {};
	}
	return Object.fromEntries(Object.entries(minimised));
}

async function applyAutomaticRiskEffects(
	payload: Payload,
	flag: RiskFlag,
	enabled: boolean,
	transactionReq?: PayloadRequest,
): Promise<RiskFlag> {
	if (
		!enabled ||
		flag.subjectType !== "shop" ||
		(flag.signal !== "velocity.payout_account_changes" &&
			flag.signal !== "identity.duplicate_payout_account")
	) {
		return flag;
	}
	const effectNote = `risk-flag:${flag.id}`;
	const until =
		flag.signal === "velocity.payout_account_changes"
			? new Date(
					Date.parse(flag.lastSeenAt) + 72 * 60 * 60 * 1000,
				).toISOString()
			: null;
	const apply = async (req: PayloadRequest) => {
		const hold = await createHold(req, {
			scope: "shop",
			shop: flag.subjectKey,
			reason: "fraud_signal",
			until,
			createdByType: "system",
			note: effectNote,
		});
		if (hold.note !== effectNote) return flag;
		const autoEffects = [
			...new Set([...(flag.autoEffects ?? []), "payout_hold" as const]),
		];
		return req.payload.update({
			collection: "risk-flags",
			id: flag.id,
			overrideAccess: true,
			req,
			data: { autoEffects },
		});
	};
	return transactionReq
		? apply(transactionReq)
		: withTransaction(payload, apply);
}

export async function recordRiskSignal(
	payload: Payload,
	input: RecordRiskSignalInput,
	now = new Date(),
	transactionReq?: PayloadRequest,
): Promise<RiskFlag | null> {
	const settings = await payload
		.findGlobal({ slug: "app-settings", req: transactionReq })
		.catch(() => null);
	if (settings?.risk?.enabled !== true) return null;
	const autoEffectsEnabled = settings.risk.autoEffectsEnabled === true;
	const subjectKey =
		input.subjectType === "phone" || input.subjectType === "device"
			? hashSensitiveSubject(input.subjectId)
			: input.subjectId;
	const existing = await payload.find({
		collection: "risk-flags",
		where: {
			and: [
				{ subjectType: { equals: input.subjectType } },
				{ subjectKey: { equals: subjectKey } },
				{ signal: { equals: input.signal } },
				{ status: { equals: "open" } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req: transactionReq,
	});
	const current = existing.docs[0];
	const previousAt = current?.lastSeenAt ? Date.parse(current.lastSeenAt) : 0;
	const withinRepeatWindow = previousAt > now.getTime() - 30 * 86_400_000;
	const previousScore =
		current && withinRepeatWindow ? Number(current.score ?? 0) : 0;
	const repeatBonus = current && withinRepeatWindow ? 5 : 0;
	const score = Math.max(
		0,
		Math.min(
			100,
			Math.max(input.scoreOverride ?? BASE_SCORE[input.signal], previousScore) +
				repeatBonus,
		),
	);
	const data = {
		subjectType: input.subjectType,
		subjectKey,
		...(input.subjectType === "user" || input.subjectType === "shop"
			? {
					subjectRef:
						input.subjectType === "user"
							? { relationTo: "users" as const, value: input.subjectId }
							: { relationTo: "shops" as const, value: input.subjectId },
				}
			: {}),
		subjectLabel: safeLabel(input, subjectKey),
		signal: input.signal,
		score,
		severity: scoreSeverity(score),
		status: current?.status ?? "open",
		evidence: minimiseEvidence(input.evidence),
		occurrences: Number(current?.occurrences ?? 0) + 1,
		firstSeenAt: current?.firstSeenAt ?? now.toISOString(),
		lastSeenAt: now.toISOString(),
	};
	if (current) {
		const updated = await payload.update({
			collection: "risk-flags",
			id: current.id,
			overrideAccess: true,
			req: transactionReq,
			data,
		});
		return applyAutomaticRiskEffects(
			payload,
			await escalateOwnerShopFlags(payload, updated, transactionReq),
			autoEffectsEnabled,
			transactionReq,
		);
	}
	const terminal = await payload.find({
		collection: "risk-flags",
		where: {
			and: [
				{ subjectType: { equals: input.subjectType } },
				{ subjectKey: { equals: subjectKey } },
				{ signal: { equals: input.signal } },
			],
		},
		limit: 20,
		depth: 0,
		overrideAccess: true,
		req: transactionReq,
	});
	try {
		const created = await payload.create({
			collection: "risk-flags",
			overrideAccess: true,
			req: transactionReq,
			data: {
				...data,
				...(terminal.docs.length
					? { related: terminal.docs.map((flag) => String(flag.id)) }
					: {}),
				occurrences: 1,
			},
		});
		return applyAutomaticRiskEffects(
			payload,
			await escalateOwnerShopFlags(payload, created, transactionReq),
			autoEffectsEnabled,
			transactionReq,
		);
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		if (transactionReq) {
			throw new RetryTransaction(
				"Open risk flag changed while recording a signal.",
			);
		}
		return recordRiskSignal(payload, input, now);
	}
}
