/** Shapes served to the web moderation console by `/api/moderation/{queue,shops,log}`. */

export const MODERATION_QUEUE_TYPES = [
	"listing",
	"report",
	"verification",
	"dispute",
	"risk",
	"payoutAccount",
] as const;
export type ModerationQueueType = (typeof MODERATION_QUEUE_TYPES)[number];

/** The types a moderator can take ownership of (claim / assign). */
export const ASSIGNABLE_QUEUE_TYPES = [
	"verification",
	"dispute",
	"risk",
] as const satisfies readonly ModerationQueueType[];

export interface ModerationPerson {
	id: string;
	name: string | null;
}

export interface ModerationQueueItem {
	type: ModerationQueueType;
	id: string;
	/** Human subject: listing title, shop name, reported target, dispute number, risk subject. */
	title: string;
	/** Secondary human text, usually the shop concerned. */
	subtitle: string | null;
	/**
	 * Machine code to translate: report reason, dispute reason, risk signal,
	 * payout method, `level:<n>` for a verification request.
	 */
	detail: string | null;
	createdAt: string;
	/** Dispute deadline only; the other domains define none. */
	dueAt: string | null;
	overdue: boolean;
	assignee: ModerationPerson | null;
	severity: "high" | "medium" | "low" | null;
	score: number | null;
	shopId: string | null;
	/** Reports: what was reported. */
	targetType: string | null;
	targetId: string | null;
	/** Disputes: the order behind the case. */
	orderId: string | null;
}

export interface ModerationQueueResponse {
	items: ModerationQueueItem[];
	/** Items in the merged list, within the per-source bound. */
	total: number;
	nextCursor: string | null;
	/** A source held more than the per-source bound: older items are not listed. */
	truncated: boolean;
}

export interface ModerationQueueNextResponse {
	item: ModerationQueueItem | null;
}

export interface RiskFlagClaimResponse {
	id: string;
	assignedTo: string;
}

export const MODERATION_SHOP_STATUSES = [
	"active",
	"suspended",
	"closed",
] as const;
export type ModerationShopStatus = (typeof MODERATION_SHOP_STATUSES)[number];

export interface ModerationShopRow {
	id: string;
	name: string;
	handle: string;
	logoUrl: string | null;
	status: ModerationShopStatus;
	level: number;
	owner: ModerationPerson | null;
	/** Pending reports against the shop or any of its listings. */
	openReports: number;
	/** Active, unexpired strikes. */
	strikes: number;
	createdAt: string;
}

export interface ModerationShopSearchResponse {
	items: ModerationShopRow[];
	nextCursor: string | null;
}

export interface ModerationLogRow {
	id: string;
	createdAt: string;
	action: string;
	actor: ModerationPerson | null;
	actorRole: string;
	targetType: string;
	targetId: string;
	reason: string | null;
	note: string | null;
	metadata: unknown;
}

export interface ModerationLogResponse {
	items: ModerationLogRow[];
	nextCursor: string | null;
}
