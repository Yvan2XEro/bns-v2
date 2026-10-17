import type { Payload, Where } from "payload";
import {
	ASSIGNABLE_QUEUE_TYPES,
	MODERATION_QUEUE_TYPES,
	type ModerationQueueItem,
	type ModerationQueueResponse,
	type ModerationQueueType,
} from "../contracts/moderationConsole";
import { relationId } from "../lib/relationId";
import { ServiceError } from "../lib/serviceError";
import type { RiskFlag } from "../payload-types";
import { assignDispute } from "./disputeModeration";
import type { Actor } from "./moderation";
import { claimRiskFlag } from "./riskFlagQueue";
import { claimRequest } from "./verification";

/**
 * Each source contributes at most this many items, oldest first, before the
 * merge: the queue is one sorted list, so a deeper page would need every
 * source read in full. `truncated` tells the console when it was reached.
 */
export const QUEUE_SOURCE_LIMIT = 200;
export const QUEUE_PAGE_SIZE = 50;
/** Candidates "take next" tries before giving up on a run of refusals. */
const NEXT_ATTEMPTS = 25;

const OPEN_DISPUTE_STATUSES = [
	"open",
	"awaiting_seller",
	"awaiting_buyer",
	"under_review",
];
const OBJECT_ID = /^[0-9a-f]{24}$/i;

export interface ModerationQueueFilters {
	type?: ModerationQueueType;
	mine?: boolean;
	cursor?: string;
	limit?: number;
}

interface CollectOptions {
	types: readonly ModerationQueueType[];
	assignee?: string;
	/** Only what a claim can take: unassigned, and verification still `submitted`. */
	claimable?: boolean;
}

type Draft = Omit<ModerationQueueItem, "assignee" | "subtitle" | "title"> & {
	assigneeId: string | null;
	title: string | null;
	subtitle: string | null;
};

const and = (conditions: Where[]): Where =>
	conditions.length === 1 ? conditions[0] : { and: conditions };

function draft(
	partial: Partial<Draft> & Pick<Draft, "type" | "id" | "createdAt">,
	now: Date,
): Draft {
	const dueAt = partial.dueAt ?? null;
	return {
		title: null,
		subtitle: null,
		detail: null,
		assigneeId: null,
		severity: null,
		score: null,
		shopId: null,
		targetType: null,
		targetId: null,
		orderId: null,
		...partial,
		dueAt,
		overdue: Boolean(dueAt && Date.parse(dueAt) < now.getTime()),
	};
}

function riskShopId(flag: RiskFlag): string | null {
	return flag.subjectRef?.relationTo === "shops"
		? relationId(flag.subjectRef.value)
		: null;
}

function compareItems(left: Draft, right: Draft): number {
	if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
	const leftKey = Date.parse(left.dueAt ?? left.createdAt);
	const rightKey = Date.parse(right.dueAt ?? right.createdAt);
	return (
		leftKey - rightKey ||
		left.type.localeCompare(right.type) ||
		left.id.localeCompare(right.id)
	);
}

async function fetchSource(
	payload: Payload,
	type: ModerationQueueType,
	options: CollectOptions,
	now: Date,
): Promise<{ drafts: Draft[]; truncated: boolean }> {
	const common = {
		depth: 0,
		limit: QUEUE_SOURCE_LIMIT + 1,
		overrideAccess: true,
	} as const;
	const assigneeOn = (field: string): Where[] => [
		...(options.assignee ? [{ [field]: { equals: options.assignee } }] : []),
		...(options.claimable ? [{ [field]: { exists: false } }] : []),
	];
	const settle = (drafts: Draft[]) => ({
		drafts: drafts.slice(0, QUEUE_SOURCE_LIMIT),
		truncated: drafts.length > QUEUE_SOURCE_LIMIT,
	});

	switch (type) {
		case "listing": {
			const found = await payload.find({
				collection: "listings",
				where: { status: { equals: "pending" } },
				sort: "createdAt",
				...common,
			});
			return settle(
				found.docs.map((doc) =>
					draft(
						{
							type,
							id: String(doc.id),
							title: doc.title,
							createdAt: doc.createdAt,
							shopId: relationId(doc.shop),
						},
						now,
					),
				),
			);
		}
		case "report": {
			const found = await payload.find({
				collection: "reports",
				where: { status: { equals: "pending" } },
				sort: "createdAt",
				...common,
			});
			return settle(
				found.docs.map((doc) =>
					draft(
						{
							type,
							id: String(doc.id),
							detail: doc.reason,
							createdAt: doc.createdAt,
							shopId: doc.targetType === "shop" ? doc.targetId : null,
							targetType: doc.targetType,
							targetId: doc.targetId,
						},
						now,
					),
				),
			);
		}
		case "verification": {
			// Live claims stay listed (with their holder) so "mine" finds them;
			// the summary's `pendingVerificationsWhere` counts only the unclaimed.
			const found = await payload.find({
				collection: "verification-requests",
				where: and([
					{
						status: {
							in: options.claimable
								? ["submitted"]
								: ["submitted", "in_review"],
						},
					},
					...(options.assignee
						? [{ assignee: { equals: options.assignee } }]
						: []),
				]),
				sort: "submittedAt",
				...common,
			});
			return settle(
				found.docs.map((doc) =>
					draft(
						{
							type,
							id: String(doc.id),
							detail: `level:${doc.requestedLevel}`,
							createdAt: doc.submittedAt ?? doc.createdAt,
							shopId: relationId(doc.shop),
							assigneeId: relationId(doc.assignee),
						},
						now,
					),
				),
			);
		}
		case "dispute": {
			const found = await payload.find({
				collection: "disputes",
				where: and([
					{ status: { in: OPEN_DISPUTE_STATUSES } },
					...assigneeOn("assignedTo"),
				]),
				sort: "createdAt",
				...common,
			});
			return settle(
				found.docs.map((doc) => {
					// Same deadline the dispute list shows: the review deadline once a
					// moderator has the case, the parties' deadline before that.
					const dueAt =
						doc.status === "under_review"
							? doc.deadlines?.reviewDueAt
							: (doc.deadlines?.respondBy ?? doc.deadlines?.submitBy);
					return draft(
						{
							type,
							id: String(doc.id),
							title: doc.number,
							detail: doc.reason,
							createdAt: doc.createdAt,
							dueAt: dueAt ?? null,
							shopId: relationId(doc.shop),
							orderId: relationId(doc.order),
							assigneeId: relationId(doc.assignedTo),
						},
						now,
					);
				}),
			);
		}
		case "risk": {
			const found = await payload.find({
				collection: "risk-flags",
				where: and([
					{ status: { equals: "open" } },
					...assigneeOn("assignedTo"),
				]),
				sort: "createdAt",
				...common,
			});
			return settle(
				found.docs.map((doc) =>
					draft(
						{
							type,
							id: String(doc.id),
							title: doc.subjectLabel || doc.subjectKey,
							detail: doc.signal,
							createdAt: doc.createdAt,
							severity: doc.severity,
							score: doc.score,
							shopId: riskShopId(doc),
							targetType: doc.subjectType,
							targetId: doc.subjectKey,
							assigneeId: relationId(doc.assignedTo),
						},
						now,
					),
				),
			);
		}
		case "payoutAccount": {
			const found = await payload.find({
				collection: "payout-accounts",
				where: { status: { equals: "pending_review" } },
				sort: "createdAt",
				...common,
			});
			return settle(
				found.docs.map((doc) =>
					draft(
						{
							type,
							id: String(doc.id),
							detail: doc.method,
							createdAt: doc.createdAt,
							shopId: relationId(doc.shop),
						},
						now,
					),
				),
			);
		}
	}
}

async function lookup<T extends { id: string }>(
	ids: Iterable<string>,
	find: (ids: string[]) => Promise<{ docs: T[] }>,
): Promise<Map<string, T>> {
	const unique = [...new Set(ids)].filter((id) => OBJECT_ID.test(id));
	if (unique.length === 0) return new Map();
	const found = await find(unique);
	return new Map(found.docs.map((doc) => [String(doc.id), doc]));
}

/** Resolves the shop, listing and user names the drafts point at, in one read per collection. */
async function present(
	payload: Payload,
	drafts: Draft[],
): Promise<ModerationQueueItem[]> {
	const reportTargets = (kind: string) =>
		drafts.flatMap((item) =>
			item.type === "report" && item.targetType === kind && item.targetId
				? [item.targetId]
				: [],
		);
	const byIds = (ids: string[]) => ({
		where: { id: { in: ids } },
		depth: 0 as const,
		limit: ids.length,
		pagination: false as const,
		overrideAccess: true,
	});
	const [shops, listings, users] = await Promise.all([
		lookup(
			drafts.flatMap((item) => (item.shopId ? [item.shopId] : [])),
			(ids) =>
				payload.find({
					collection: "shops",
					select: { name: true },
					...byIds(ids),
				}),
		),
		lookup(reportTargets("listing"), (ids) =>
			payload.find({
				collection: "listings",
				select: { title: true },
				...byIds(ids),
			}),
		),
		lookup(
			[
				...drafts.flatMap((item) => (item.assigneeId ? [item.assigneeId] : [])),
				...reportTargets("user"),
			],
			(ids) =>
				payload.find({
					collection: "users",
					select: { name: true },
					...byIds(ids),
				}),
		),
	]);

	return drafts.map(({ assigneeId, ...item }) => {
		const shopName = item.shopId
			? (shops.get(item.shopId)?.name ?? null)
			: null;
		let title = item.title;
		let subtitle = item.subtitle;
		if (item.type === "report") {
			const target = item.targetId ?? "";
			title =
				(item.targetType === "listing"
					? listings.get(target)?.title
					: item.targetType === "shop"
						? shops.get(target)?.name
						: item.targetType === "user"
							? users.get(target)?.name
							: null) || target;
		} else if (item.type === "verification" || item.type === "payoutAccount") {
			title = shopName ?? item.shopId ?? item.id;
		} else {
			subtitle = shopName;
		}
		return {
			...item,
			title: title ?? item.id,
			subtitle,
			assignee: assigneeId
				? { id: assigneeId, name: users.get(assigneeId)?.name ?? null }
				: null,
		};
	});
}

async function collect(
	payload: Payload,
	options: CollectOptions,
	now: Date,
): Promise<{ drafts: Draft[]; truncated: boolean }> {
	const sources = await Promise.all(
		options.types.map((type) => fetchSource(payload, type, options, now)),
	);
	return {
		drafts: sources.flatMap((source) => source.drafts).sort(compareItems),
		truncated: sources.some((source) => source.truncated),
	};
}

export function isQueueCursorValid(value: string | undefined): boolean {
	return value === undefined || /^\d{1,6}$/.test(value);
}

/**
 * Everything awaiting a moderator, merged into one list: overdue first, then
 * the oldest deadline (or arrival when the domain sets none). The cursor is
 * an offset into that list, recomputed on each read.
 */
export async function getModerationQueue(
	payload: Payload,
	actor: Actor,
	filters: ModerationQueueFilters = {},
	now = new Date(),
): Promise<ModerationQueueResponse> {
	const candidates: readonly ModerationQueueType[] = filters.mine
		? ASSIGNABLE_QUEUE_TYPES
		: MODERATION_QUEUE_TYPES;
	const types = filters.type
		? candidates.filter((type) => type === filters.type)
		: candidates;
	const { drafts, truncated } = await collect(
		payload,
		{ types, assignee: filters.mine ? actor.id : undefined },
		now,
	);
	const offset = Number(filters.cursor ?? 0);
	const limit = filters.limit ?? QUEUE_PAGE_SIZE;
	const page = drafts.slice(offset, offset + limit);
	return {
		items: await present(payload, page),
		total: drafts.length,
		nextCursor: offset + limit < drafts.length ? String(offset + limit) : null,
		truncated,
	};
}

async function claim(
	payload: Payload,
	actor: Actor,
	item: Draft,
): Promise<void> {
	if (item.type === "verification") {
		await claimRequest(payload, actor, item.id);
	} else if (item.type === "dispute") {
		await assignDispute(payload, actor, item.id, { expectUnassigned: true });
	} else if (item.type === "risk") {
		await claimRiskFlag(payload, actor, item.id);
	}
}

/**
 * Assigns the caller the most urgent unassigned item that supports
 * assignment. A refusal (someone else got there first, a conflict of
 * interest, a rank too low) moves on to the next candidate; anything else is
 * a real failure and surfaces.
 */
export async function takeNextQueueItem(
	payload: Payload,
	actor: Actor,
	type?: ModerationQueueType,
	now = new Date(),
): Promise<ModerationQueueItem | null> {
	const types = type
		? ASSIGNABLE_QUEUE_TYPES.filter((candidate) => candidate === type)
		: ASSIGNABLE_QUEUE_TYPES;
	const { drafts } = await collect(payload, { types, claimable: true }, now);
	for (const candidate of drafts.slice(0, NEXT_ATTEMPTS)) {
		try {
			await claim(payload, actor, candidate);
		} catch (error) {
			if (error instanceof ServiceError) continue;
			throw error;
		}
		const [item] = await present(payload, [
			{ ...candidate, assigneeId: actor.id },
		]);
		return item;
	}
	return null;
}
