import type { Payload } from "payload";
import { isModerator } from "../access/roles";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import type { ModerationLog, RiskFlag } from "../payload-types";
import type {
	RiskEvidenceRow,
	RiskFlagDetail,
	RiskFlagQueueItem,
	RiskModerationHistoryEntry,
} from "../types/riskModeration";
import type { Actor } from "./moderation";

const ACTIVE_DISPUTE_STATUSES = [
	"open",
	"awaiting_seller",
	"awaiting_buyer",
	"under_review",
] as const;
const PRIVATE_EVIDENCE_KEY =
	/(phone|device|name|address|document|image|photo|message|email|token|gps|coordinate)/i;
const DAY_MS = 86_400_000;

export function toRiskFlagQueueItem(flag: RiskFlag): RiskFlagQueueItem {
	return {
		id: String(flag.id),
		subjectType: flag.subjectType,
		subjectLabel: flag.subjectLabel ?? null,
		signal: flag.signal,
		score: flag.score,
		severity: flag.severity,
		status: flag.status,
		occurrences: flag.occurrences ?? 1,
		firstSeenAt: flag.firstSeenAt,
		lastSeenAt: flag.lastSeenAt,
		autoEffects: flag.autoEffects ?? null,
		resolution: flag.resolution ?? "none",
		resolutionNote: flag.resolutionNote ?? null,
		reviewedAt: flag.reviewedAt ?? null,
	};
}

function evidenceRows(evidence: RiskFlag["evidence"]): RiskEvidenceRow[] {
	if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
		return [];
	}
	return Object.entries(evidence).flatMap(([key, value]) => {
		if (PRIVATE_EVIDENCE_KEY.test(key)) return [];
		if (
			typeof value !== "string" &&
			typeof value !== "number" &&
			typeof value !== "boolean" &&
			value !== null
		) {
			return [];
		}
		const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
		const label = words.charAt(0).toUpperCase() + words.slice(1);
		return [{ label, value }];
	});
}

function rate(numerator: number, denominator: number): number | null {
	return denominator > 0 ? numerator / denominator : null;
}

function ageInDays(createdAt: string, now: Date): number {
	const elapsed = now.getTime() - Date.parse(createdAt);
	return Number.isFinite(elapsed)
		? Math.max(0, Math.floor(elapsed / DAY_MS))
		: 0;
}

async function moderationHistory(
	payload: Payload,
	targetType: "user" | "shop",
	targetId: string,
): Promise<ModerationLog[]> {
	const result = await payload.find({
		collection: "moderation-log",
		where: {
			and: [
				{ targetType: { equals: targetType } },
				{ targetId: { equals: targetId } },
			],
		},
		sort: "-createdAt",
		limit: 100,
		depth: 0,
		overrideAccess: true,
	});
	return result.docs;
}

async function userSummary(payload: Payload, userId: string, now: Date) {
	const user = await payload.findByID({
		collection: "users",
		id: userId,
		depth: 0,
		overrideAccess: true,
	});
	const shopsResult = await payload.find({
		collection: "shops",
		where: { owner: { equals: userId } },
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const shops = shopsResult.docs;
	return {
		subject: {
			type: "user" as const,
			id: String(user.id),
			name: user.name,
			accountAgeDays: ageInDays(user.createdAt, now),
			level: user.identityVerifiedAt ? 2 : 1,
			shops: shops.map((shop) => ({
				id: String(shop.id),
				name: shop.name,
				status: shop.status,
				level: shop.level ?? 1,
			})),
		},
	};
}

async function shopSummary(payload: Payload, shopId: string, now: Date) {
	const shop = await payload.findByID({
		collection: "shops",
		id: shopId,
		depth: 0,
		overrideAccess: true,
	});
	const start = new Date(now.getTime() - 30 * DAY_MS)
		.toISOString()
		.slice(0, 10);
	const end = now.toISOString().slice(0, 10);
	const [statsResult, disputesResult] = await Promise.all([
		payload.find({
			collection: "shop-daily-stats",
			where: {
				and: [
					{ shop: { equals: shopId } },
					{ date: { greater_than_equal: start } },
					{ date: { less_than_equal: end } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		}),
		payload.find({
			collection: "disputes",
			where: {
				and: [
					{ shop: { equals: shopId } },
					{ status: { in: [...ACTIVE_DISPUTE_STATUSES] } },
				],
			},
			limit: 0,
			pagination: false,
			depth: 0,
			overrideAccess: true,
		}),
	]);
	const placed = statsResult.docs.reduce(
		(total, stat) => total + Number(stat.ordersPlaced ?? 0),
		0,
	);
	const sellerCancelled = statsResult.docs.reduce(
		(total, stat) => total + Number(stat.ordersCancelledBySeller ?? 0),
		0,
	);
	return {
		subject: {
			type: "shop" as const,
			id: String(shop.id),
			name: shop.name,
			level: shop.level ?? 1,
			status: shop.status,
			rates: { sellerCancellation: rate(sellerCancelled, placed) },
			openDisputes: disputesResult.docs.length,
		},
		shop,
	};
}

export async function getRiskFlagDetail(
	payload: Payload,
	actor: Actor,
	flagId: string,
	now = new Date(),
): Promise<RiskFlagDetail> {
	if (!isModerator(actor)) {
		throw new ServiceError(ERROR_CODES.moderationForbidden, 403);
	}
	const flag = await payload
		.findByID({
			collection: "risk-flags",
			id: flagId,
			depth: 0,
			overrideAccess: true,
		})
		.catch(() => null);
	if (!flag) {
		throw new ServiceError(ERROR_CODES.moderationTargetNotFound, 404);
	}
	payload.logger.info({
		event: "risk_flag.view",
		actorId: actor.id,
		flagId: String(flag.id),
	});

	const relatedIds = (flag.related ?? [])
		.map(relationId)
		.filter((id): id is string => Boolean(id));
	const relatedResult = relatedIds.length
		? await payload.find({
				collection: "risk-flags",
				where: { id: { in: relatedIds } },
				limit: relatedIds.length,
				depth: 0,
				overrideAccess: true,
			})
		: { docs: [] };
	let subject: Record<string, unknown>;
	let history: ModerationLog[] = [];
	if (flag.subjectType === "user") {
		const details = await userSummary(payload, flag.subjectKey, now);
		subject = details.subject;
		history = await moderationHistory(payload, "user", flag.subjectKey);
		subject = {
			...details.subject,
			suspensionHistory: history.filter((entry) =>
				["user.suspend", "user.unsuspend"].includes(entry.action),
			),
		};
	} else if (flag.subjectType === "shop") {
		const details = await shopSummary(payload, flag.subjectKey, now);
		subject = details.subject;
		history = await moderationHistory(payload, "shop", flag.subjectKey);
	} else {
		subject = {
			type: flag.subjectType,
			label: flag.subjectLabel ?? "Unidentified subject",
			linkedUsers: relatedResult.docs
				.filter((related) => related.subjectType === "user")
				.map((related) => String(related.subjectKey)),
			linkedShops: relatedResult.docs
				.filter((related) => related.subjectType === "shop")
				.map((related) => String(related.subjectKey)),
		};
		const relevantEntities = relatedResult.docs.flatMap((related) =>
			related.subjectType === "user" || related.subjectType === "shop"
				? [{ type: related.subjectType, id: related.subjectKey }]
				: [],
		);
		const histories = await Promise.all(
			relevantEntities.map((entity) =>
				moderationHistory(payload, entity.type, entity.id),
			),
		);
		history = histories
			.flat()
			.sort((left, right) =>
				(right.createdAt ?? "").localeCompare(left.createdAt ?? ""),
			);
	}
	return {
		flag: toRiskFlagQueueItem(flag),
		subject,
		evidenceRows: evidenceRows(flag.evidence),
		relatedFlags: relatedResult.docs.map(toRiskFlagQueueItem),
		moderationHistory: history.map(
			(entry): RiskModerationHistoryEntry => ({
				id: String(entry.id),
				action: entry.action,
				createdAt: entry.createdAt,
			}),
		),
	};
}
