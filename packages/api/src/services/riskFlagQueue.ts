import type { Payload, Where } from "payload";
import { z } from "zod";
import { ERROR_CODES } from "../lib/errors";
import { relationId } from "../lib/relationId";
import { withTransaction } from "../lib/transactions";
import type { RiskFlag } from "../payload-types";
import type {
	RiskSeverity,
	RiskSignal,
	RiskStatus,
	RiskSubjectType,
} from "../types/riskModeration";
import {
	type Actor,
	assertModerator,
	ModerationError,
	writeLog,
} from "./moderation";
import { toRiskFlagQueueItem } from "./riskFlagDetail";

const PAGE_SIZE = 50;
const severityRank = { high: 0, medium: 1, low: 2 } as const;
const cursorSchema = z.object({
	severity: z.enum(["high", "medium", "low"]),
	score: z.number(),
	lastSeenAt: z.string(),
	id: z.string(),
});

export interface RiskFlagQueueFilters {
	status?: RiskStatus;
	severity?: RiskSeverity;
	signal?: RiskSignal;
	subjectType?: RiskSubjectType;
	cursor?: string;
}

function decodeCursor(value: string | undefined) {
	if (!value) return null;
	try {
		const parsed = cursorSchema.safeParse(
			JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
		);
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

function cursorFor(flag: RiskFlag): string {
	return Buffer.from(
		JSON.stringify({
			severity: flag.severity,
			score: flag.score,
			lastSeenAt: flag.lastSeenAt,
			id: String(flag.id),
		}),
	).toString("base64url");
}

function compareFlags(left: RiskFlag, right: RiskFlag): number {
	return (
		severityRank[left.severity] - severityRank[right.severity] ||
		right.score - left.score ||
		right.lastSeenAt.localeCompare(left.lastSeenAt) ||
		String(left.id).localeCompare(String(right.id))
	);
}

function whereAfterCursor(
	cursor: NonNullable<ReturnType<typeof decodeCursor>>,
): Where {
	return {
		or: [
			{ score: { less_than: cursor.score } },
			{
				and: [
					{ score: { equals: cursor.score } },
					{ lastSeenAt: { less_than: cursor.lastSeenAt } },
				],
			},
			{
				and: [
					{ score: { equals: cursor.score } },
					{ lastSeenAt: { equals: cursor.lastSeenAt } },
					{ id: { greater_than: cursor.id } },
				],
			},
		],
	};
}

export function isRiskFlagCursorValid(value: string | undefined): boolean {
	return value === undefined || decodeCursor(value) !== null;
}

export async function getRiskFlagQueue(
	payload: Payload,
	filters: RiskFlagQueueFilters = {},
) {
	const cursor = decodeCursor(filters.cursor);
	if (filters.cursor && !cursor) throw new Error("Invalid risk flag cursor.");
	const base: Where[] = [
		{ status: { equals: filters.status ?? "open" } },
		...(filters.severity ? [{ severity: { equals: filters.severity } }] : []),
		...(filters.signal ? [{ signal: { equals: filters.signal } }] : []),
		...(filters.subjectType
			? [{ subjectType: { equals: filters.subjectType } }]
			: []),
	];
	const severities = (["high", "medium", "low"] as const).filter(
		(severity) =>
			(!filters.severity || filters.severity === severity) &&
			(!cursor || severityRank[severity] >= severityRank[cursor.severity]),
	);
	const groups = await Promise.all(
		severities.map((severity) =>
			payload.find({
				collection: "risk-flags",
				where: {
					and: [
						...base,
						{ severity: { equals: severity } },
						...(cursor && cursor.severity === severity
							? [whereAfterCursor(cursor)]
							: []),
					],
				},
				limit: PAGE_SIZE + 1,
				sort: ["-score", "-lastSeenAt", "id"],
				depth: 0,
				overrideAccess: true,
			}),
		),
	);
	const ordered = groups.flatMap((group) => group.docs).sort(compareFlags);
	const flags = ordered.slice(0, PAGE_SIZE);
	const lastFlag = flags.at(-1);
	return {
		items: flags.map(toRiskFlagQueueItem),
		hasMore: ordered.length > PAGE_SIZE,
		nextCursor:
			ordered.length > PAGE_SIZE && lastFlag ? cursorFor(lastFlag) : null,
	};
}

/**
 * Takes an open flag for the caller. Never a takeover: a flag someone else
 * holds is refused, and the write is conditioned on the flag still being
 * open and unassigned so two racing claims cannot both land.
 */
export async function claimRiskFlag(
	payload: Payload,
	actor: Actor,
	flagId: string,
): Promise<RiskFlag> {
	assertModerator(actor);
	return withTransaction(
		payload,
		async (req) => {
			const flag = await req.payload
				.findByID({
					collection: "risk-flags",
					id: flagId,
					depth: 0,
					overrideAccess: true,
					req,
				})
				.catch(() => null);
			if (!flag)
				throw new ModerationError(ERROR_CODES.moderationTargetNotFound, 404);
			if (flag.status !== "open")
				throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
			const holder = relationId(flag.assignedTo);
			if (holder === actor.id) return flag;
			if (holder)
				throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
			const updated: unknown = await req.payload.db.updateOne({
				collection: "risk-flags",
				where: {
					and: [
						{ id: { equals: flagId } },
						{ status: { equals: "open" } },
						{ assignedTo: { exists: false } },
					],
				},
				data: { assignedTo: actor.id },
				req,
			});
			if (!updated)
				throw new ModerationError(ERROR_CODES.moderationInvalidTransition, 409);
			await writeLog(
				req.payload,
				{
					actor,
					action: "risk_flag.assign",
					targetType: "risk-flag",
					targetId: flagId,
					metadata: { assignedTo: actor.id },
				},
				req,
			);
			return { ...flag, assignedTo: actor.id };
		},
		{ user: actor },
	);
}
