import {
	type ListingRejectionReason,
	rejectionNeedsMessage,
} from "../../../api/src/contracts/listingRejection";
/**
 * URL state, REST paths and decision bodies for the console's Reports
 * section, which holds both user reports and listings awaiting review (the
 * queue sends both here). Reports and listings are read straight from
 * Payload's REST API, as the mobile moderation screens do.
 */
import type {
	ReportReason,
	ReportTargetType,
} from "../../../api/src/contracts/moderationConsole";
import {
	type QueueSelection,
	REPORT_REASON_LABELS,
} from "./moderation-console";
import { query } from "./shop-api";

export const REPORTS_PAGE_SIZE = 20;
export const DECISION_TEXT_MAX = 2000;

export type ReportsTab = "reports" | "listings";

/** A Payload REST list page. */
export interface PayloadPage<T> {
	docs: T[];
	totalDocs: number;
	hasNextPage: boolean;
	nextPage?: number | null;
}

export const REPORT_STATUSES = ["pending", "resolved", "reviewed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
	pending: "reports.status.pending",
	resolved: "reports.status.resolved",
	reviewed: "reports.status.reviewed",
};

export const REPORT_TARGET_TYPES: ReportTargetType[] = [
	"listing",
	"shop",
	"user",
	"message",
	"order",
	"shipment",
];

export interface ReportFilters {
	status: ReportStatus;
	reason?: ReportReason;
	target?: ReportTargetType;
}

const isReportStatus = (value: string): value is ReportStatus =>
	(REPORT_STATUSES as readonly string[]).includes(value);
export const isReportReason = (value: string): value is ReportReason =>
	Object.hasOwn(REPORT_REASON_LABELS, value);
export const isReportTargetType = (value: string): value is ReportTargetType =>
	(REPORT_TARGET_TYPES as string[]).includes(value);

interface Params {
	get(name: string): string | null;
}

export function parseReportFilters(params: Params): ReportFilters {
	const status = params.get("status") ?? "";
	const reason = params.get("reason") ?? "";
	const target = params.get("target") ?? "";
	return {
		status: isReportStatus(status) ? status : "pending",
		reason: isReportReason(reason) ? reason : undefined,
		target: isReportTargetType(target) ? target : undefined,
	};
}

/** An explicit `?tab=` wins; otherwise an open listing shows the listings tab. */
export function parseReportsTab(
	params: Params,
	selection: QueueSelection | null,
): ReportsTab {
	const tab = params.get("tab");
	if (tab === "listings" || tab === "reports") return tab;
	return selection?.type === "listing" ? "listings" : "reports";
}

/** The section URL for a tab and its filters; the open item is dropped. */
export function reportsHref(
	pathname: string,
	tab: ReportsTab,
	filters: Partial<ReportFilters> = {},
): string {
	if (tab === "listings") return `${pathname}?tab=listings`;
	return `${pathname}${query({
		tab: "reports",
		status:
			filters.status && filters.status !== "pending"
				? filters.status
				: undefined,
		reason: filters.reason,
		target: filters.target,
	})}`;
}

function payloadQuery(
	where: Record<string, string>,
	extra: Record<string, string | number>,
): string {
	const search = new URLSearchParams();
	for (const [field, value] of Object.entries(where))
		search.set(`where[${field}][equals]`, value);
	for (const [key, value] of Object.entries(extra))
		search.set(key, String(value));
	return `?${search.toString()}`;
}

/** Pending reports oldest first; decided ones most recently decided first. */
export function reportsPath(filters: ReportFilters, page: number): string {
	return `/api/reports${payloadQuery(
		{
			status: filters.status,
			...(filters.reason ? { reason: filters.reason } : {}),
			...(filters.target ? { targetType: filters.target } : {}),
		},
		{
			sort: filters.status === "pending" ? "createdAt" : "-updatedAt",
			depth: 1,
			limit: REPORTS_PAGE_SIZE,
			page,
		},
	)}`;
}

export function pendingListingsPath(page: number): string {
	return `/api/listings${payloadQuery(
		{ status: "pending" },
		{ sort: "createdAt", depth: 1, limit: REPORTS_PAGE_SIZE, page },
	)}`;
}

/** Every report on the same target, so a moderator sees a pile-up at once. */
export function targetReportsPath(
	targetType: string,
	targetId: string,
): string {
	return `/api/reports${payloadQuery(
		{ targetType, targetId },
		{ sort: "-createdAt", depth: 0, limit: 11 },
	)}`;
}

/**
 * Where a reported target can be looked at: a listing's public page, or a
 * shop's moderation sheet. Accounts, messages, orders and shipments have no
 * web page a moderator can open yet.
 */
export function reportTargetHref(
	targetType: string,
	targetId: string,
): string | null {
	const id = encodeURIComponent(targetId);
	if (targetType === "listing") return `/listing/${id}`;
	if (targetType === "shop") return `/moderation/shops/${id}`;
	return null;
}

export type DecisionCheck<T> = { ok: true; body: T } | { ok: false };

export type ReportOutcome = "resolved" | "dismissed";

/**
 * Mirrors `decideReport`: resolving needs a written resolution, dismissing
 * may leave it empty (the server records "Dismissed").
 */
export function reportDecisionBody(
	outcome: ReportOutcome,
	resolution: string,
): DecisionCheck<{ outcome: ReportOutcome; resolution?: string }> {
	const text = resolution.trim();
	if (text.length > DECISION_TEXT_MAX) return { ok: false };
	if (outcome === "resolved" && !text) return { ok: false };
	return { ok: true, body: text ? { outcome, resolution: text } : { outcome } };
}

export type ListingAction = "approve" | "reject";

/** Mirrors `rejectListing`: a rejection carries the reason shown to the seller. */
/** What `POST /api/moderation/listings/:id` takes. */
export interface ListingDecisionBody {
	action: ListingAction;
	/** A rejection's reason, worded for the seller in their language. */
	reasonCode?: ListingRejectionReason;
	/** The moderator's own words to the seller; required for `other`. */
	message?: string;
	note?: string;
}

export function listingDecisionBody(
	action: ListingAction,
	reasonCode: ListingRejectionReason | "",
	message: string,
	note: string,
): DecisionCheck<ListingDecisionBody> {
	const cleanMessage = message.trim();
	const cleanNote = note.trim();
	if (
		cleanMessage.length > DECISION_TEXT_MAX ||
		cleanNote.length > DECISION_TEXT_MAX
	)
		return { ok: false };
	if (action === "approve")
		return {
			ok: true,
			body: { action, ...(cleanNote ? { note: cleanNote } : {}) },
		};
	if (!reasonCode || (rejectionNeedsMessage(reasonCode) && !cleanMessage))
		return { ok: false };
	return {
		ok: true,
		body: {
			action,
			reasonCode,
			...(cleanMessage ? { message: cleanMessage } : {}),
			...(cleanNote ? { note: cleanNote } : {}),
		},
	};
}

/**
 * After a decision the panel moves to the item that followed it in the list,
 * or the one before when it was the last; `null` closes the panel.
 */
export function nextAfter(ids: string[], decided: string): string | null {
	const at = ids.indexOf(decided);
	if (at === -1) return null;
	return ids[at + 1] ?? ids[at - 1] ?? null;
}

/** A relation is either an id or, at `depth >= 1`, the populated document. */
export function populated<T extends object>(
	value: string | T | null | undefined,
): T | null {
	return value && typeof value === "object" ? value : null;
}

interface MediaLike {
	url?: string | null;
	thumbnailURL?: string | null;
}

/** The listing's photos that resolved to a URL, full size and thumbnail. */
export function listingPhotos(listing: {
	images?: { image: string | MediaLike; id?: string | null }[] | null;
}): { key: string; url: string; thumb: string }[] {
	return (listing.images ?? []).flatMap((entry, index) => {
		const media = populated(entry.image);
		const url = media?.url ?? media?.thumbnailURL;
		if (!url) return [];
		return [
			{
				key: entry.id ?? `${index}:${url}`,
				url,
				thumb: media?.thumbnailURL ?? url,
			},
		];
	});
}
