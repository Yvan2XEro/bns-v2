/**
 * Display vocabulary and URL state for the moderation console. Every label
 * map is an explicit literal keyed by the API's own union, so a new server
 * code fails the typecheck here, and `moderation-console.test.ts` resolves
 * each value against both locales (a computed key is invisible to
 * `messages-keys.test.ts`).
 */
import type {
	ModerationLogAction,
	ModerationQueueItem,
	ModerationQueueType,
	ModerationSummary,
	ReportReason,
	ReportTargetType,
	RiskSignal,
	RiskSubjectType,
} from "../../../api/src/contracts/moderationConsole";
import { DISPUTE_REASON_LABELS, type DisputeReason } from "./case-status";
import { PAYOUT_METHODS, type PayoutMethod } from "./payment-status";
import { query } from "./shop-api";

export const QUEUE_PAGE_SIZE = 50;

export const QUEUE_TYPE_ORDER: ModerationQueueType[] = [
	"report",
	"listing",
	"verification",
	"dispute",
	"risk",
	"payoutAccount",
];

export const QUEUE_TYPE_LABELS: Record<ModerationQueueType, string> = {
	listing: "type.listing",
	report: "type.report",
	verification: "type.verification",
	dispute: "type.dispute",
	risk: "type.risk",
	payoutAccount: "type.payoutAccount",
};

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
	spam: "reportReason.spam",
	inappropriate: "reportReason.inappropriate",
	fraud: "reportReason.fraud",
	prohibited: "reportReason.prohibited",
	harassment: "reportReason.harassment",
	other: "reportReason.other",
	delivery_contested: "reportReason.delivery_contested",
	cod_remittance: "reportReason.cod_remittance",
	return_overdue: "reportReason.return_overdue",
};

export const TARGET_TYPE_LABELS: Record<
	ReportTargetType | RiskSubjectType,
	string
> = {
	listing: "target.listing",
	user: "target.user",
	message: "target.message",
	shop: "target.shop",
	order: "target.order",
	shipment: "target.shipment",
	phone: "target.phone",
	device: "target.device",
};

export const RISK_SIGNAL_LABELS: Record<RiskSignal, string> = {
	"velocity.orders_per_phone": "riskSignal.velocity_orders_per_phone",
	"velocity.checkout_attempts": "riskSignal.velocity_checkout_attempts",
	"velocity.payout_account_changes":
		"riskSignal.velocity_payout_account_changes",
	"velocity.shop_creation": "riskSignal.velocity_shop_creation",
	"velocity.accounts_per_device": "riskSignal.velocity_accounts_per_device",
	"identity.duplicate_document": "riskSignal.identity_duplicate_document",
	"identity.duplicate_payout_account":
		"riskSignal.identity_duplicate_payout_account",
	"orders.seller_cancellation_ratio":
		"riskSignal.orders_seller_cancellation_ratio",
	"orders.dispute_ratio": "riskSignal.orders_dispute_ratio",
	"cod.refusal_streak": "riskSignal.cod_refusal_streak",
	"cod.refusal_ratio_shop": "riskSignal.cod_refusal_ratio_shop",
	"resale.self_dealing": "riskSignal.resale_self_dealing",
	"resale.shared_identity": "riskSignal.resale_shared_identity",
	"resale.handover_at_supplier": "riskSignal.resale_handover_at_supplier",
	"resale.buyer_concentration": "riskSignal.resale_buyer_concentration",
	"resale.cancellation_pattern": "riskSignal.resale_cancellation_pattern",
	"resale.refusal_pattern": "riskSignal.resale_refusal_pattern",
	dispute_lost_seller: "riskSignal.dispute_lost_seller",
	counterfeit_confirmed: "riskSignal.counterfeit_confirmed",
	refund_overdue: "riskSignal.refund_overdue",
	seller_no_response: "riskSignal.seller_no_response",
	unavailable_after_confirmation: "riskSignal.unavailable_after_confirmation",
	dispute_abuse_buyer: "riskSignal.dispute_abuse_buyer",
	cod_refusal_abuse: "riskSignal.cod_refusal_abuse",
	serial_withdrawal: "riskSignal.serial_withdrawal",
	evidence_reused: "riskSignal.evidence_reused",
	review_extortion: "riskSignal.review_extortion",
	resale_collusion_suspected: "riskSignal.resale_collusion_suspected",
	commission_credit_unpaid: "riskSignal.commission_credit_unpaid",
};

export const LOG_ACTION_LABELS: Record<ModerationLogAction, string> = {
	"listing.approve": "logAction.listing_approve",
	"listing.reject": "logAction.listing_reject",
	"listing.takedown": "logAction.listing_takedown",
	"listing.holdRelease": "logAction.listing_holdRelease",
	"user.suspend": "logAction.user_suspend",
	"user.unsuspend": "logAction.user_unsuspend",
	"shop.suspend": "logAction.shop_suspend",
	"shop.unsuspend": "logAction.shop_unsuspend",
	"report.resolve": "logAction.report_resolve",
	"report.dismiss": "logAction.report_dismiss",
	"verification.claim": "logAction.verification_claim",
	"verification.release": "logAction.verification_release",
	"verification.request_info": "logAction.verification_request_info",
	"verification.approve": "logAction.verification_approve",
	"verification.reject": "logAction.verification_reject",
	"verification.revoke": "logAction.verification_revoke",
	"verification.expire": "logAction.verification_expire",
	"order.cancel": "logAction.order_cancel",
	"commission.waive": "logAction.commission_waive",
	"payout.hold": "logAction.payout_hold",
	"payout.release": "logAction.payout_release",
	"payout.account_approve": "logAction.payout_account_approve",
	"payout.account_reject": "logAction.payout_account_reject",
	"dispute.resolve": "logAction.dispute_resolve",
	"dispute.request_info": "logAction.dispute_request_info",
	"dispute.redact_message": "logAction.dispute_redact_message",
	"dispute.assign": "logAction.dispute_assign",
	"strike.revoke": "logAction.strike_revoke",
	"resale_link.suspend": "logAction.resale_link_suspend",
	"resale_link.unsuspend": "logAction.resale_link_unsuspend",
	"risk_flag.review": "logAction.risk_flag_review",
	"risk_flag.dismiss": "logAction.risk_flag_dismiss",
	"risk_flag.action": "logAction.risk_flag_action",
	"risk_flag.assign": "logAction.risk_flag_assign",
	"review.photo_remove": "logAction.review_photo_remove",
};

const has = <K extends string>(map: Record<K, string>, key: string): key is K =>
	Object.hasOwn(map, key);

/** A key from the messages root, with its ICU values, or the raw code when nothing translates it. */
export type DetailLabel =
	| { key: string; values?: Record<string, string | number> }
	| { raw: string };

/** Unknown codes fall back to the raw code rather than a missing-key path. */
export function detailLabel(
	type: ModerationQueueType,
	detail: string | null,
): DetailLabel | null {
	if (!detail) return null;
	switch (type) {
		case "report":
			if (has(REPORT_REASON_LABELS, detail))
				return {
					key: `ModerationConsole.${REPORT_REASON_LABELS[detail]}`,
				};
			break;
		case "risk":
			if (has(RISK_SIGNAL_LABELS, detail))
				return { key: `ModerationConsole.${RISK_SIGNAL_LABELS[detail]}` };
			break;
		case "dispute":
			if (has<DisputeReason>(DISPUTE_REASON_LABELS, detail))
				return { key: `Disputes.${DISPUTE_REASON_LABELS[detail]}` };
			break;
		case "payoutAccount":
			if (has<PayoutMethod>(PAYOUT_METHODS, detail))
				return { key: `Payments.${PAYOUT_METHODS[detail]}` };
			break;
		case "verification": {
			const level = /^level:(\d+)$/.exec(detail)?.[1];
			if (level)
				return {
					key: "ModerationConsole.level",
					values: { level: Number(level) },
				};
			break;
		}
		case "listing":
			break;
	}
	return { raw: detail };
}

export function targetLabel(target: string | null): string | null {
	return target && has(TARGET_TYPE_LABELS, target)
		? TARGET_TYPE_LABELS[target]
		: null;
}

export function logActionLabel(action: string): DetailLabel {
	return has(LOG_ACTION_LABELS, action)
		? { key: `ModerationConsole.${LOG_ACTION_LABELS[action]}` }
		: { raw: action };
}

export function isQueueType(value: string): value is ModerationQueueType {
	return has(QUEUE_TYPE_LABELS, value);
}

export interface QueueSelection {
	type: ModerationQueueType;
	id: string;
}

/** `?item=type:id`: one shareable parameter names the open item. */
export function parseSelection(
	value: string | null | undefined,
): QueueSelection | null {
	if (!value) return null;
	const at = value.indexOf(":");
	if (at <= 0) return null;
	const type = value.slice(0, at);
	const id = value.slice(at + 1);
	if (!isQueueType(type) || !/^[\w-]+$/.test(id)) return null;
	return { type, id };
}

export function selectionParam(item: QueueSelection): string {
	return `${item.type}:${item.id}`;
}

export function isSelected(
	item: QueueSelection,
	selection: QueueSelection | null,
): boolean {
	return selection?.type === item.type && selection.id === item.id;
}

/**
 * The open item: from the loaded pages, or the one "take next" just claimed,
 * which may sit beyond them or outside the active type filter.
 */
export function selectedQueueItem<T extends QueueSelection>(
	items: readonly T[],
	selection: QueueSelection | null,
	taken: T | null = null,
): T | null {
	if (!selection) return null;
	const loaded = items.find((item) => isSelected(item, selection));
	if (loaded) return loaded;
	return taken && isSelected(taken, selection) ? taken : null;
}

export interface QueueFilters {
	type?: ModerationQueueType;
	mine?: boolean;
}

export function parseQueueFilters(params: {
	get(name: string): string | null;
}): QueueFilters {
	const type = params.get("type");
	return {
		type: type && isQueueType(type) ? type : undefined,
		mine: params.get("mine") === "1" ? true : undefined,
	};
}

export function queueQuery(
	filters: QueueFilters,
	cursor?: string | null,
): string {
	return query({
		type: filters.type,
		mine: filters.mine ? "1" : undefined,
		limit: QUEUE_PAGE_SIZE,
		cursor,
	});
}

/** The console URL for a filter set and an open item, other parameters dropped. */
export function consoleHref(
	pathname: string,
	filters: QueueFilters,
	selection: QueueSelection | null = null,
): string {
	return `${pathname}${query({
		type: filters.type,
		mine: filters.mine ? "1" : undefined,
		item: selection ? selectionParam(selection) : undefined,
	})}`;
}

/** Verifications and disputes have full workspaces; everything else opens in the side panel. */
export function workspaceHref(item: QueueSelection): string | null {
	if (item.type === "verification")
		return `/moderation/verification/${encodeURIComponent(item.id)}`;
	if (item.type === "dispute")
		return `/moderation/disputes/${encodeURIComponent(item.id)}`;
	return null;
}

/**
 * Where a panel item is decided. Reports and listings land in the reports
 * section and risk flags in the risk section; a
 * payout account is reviewed from its shop's sheet.
 */
export function handledHref(
	item: Pick<ModerationQueueItem, "type" | "id" | "shopId">,
): string | null {
	const param = encodeURIComponent(selectionParam(item));
	switch (item.type) {
		case "report":
			return `/moderation/reports?item=${param}`;
		case "listing":
			return `/moderation/reports?tab=listings&item=${param}`;
		case "risk":
			return `/moderation/risk?item=${param}`;
		case "payoutAccount":
			return item.shopId
				? `/moderation/shops/${encodeURIComponent(item.shopId)}`
				: null;
		default:
			return workspaceHref(item);
	}
}

export const ASSIGNABLE_TYPES: readonly ModerationQueueType[] = [
	"verification",
	"dispute",
	"risk",
];

export function isAssignable(type: ModerationQueueType | undefined): boolean {
	return type !== undefined && ASSIGNABLE_TYPES.includes(type);
}

export function typeCount(
	summary: ModerationSummary | undefined,
	type: ModerationQueueType,
): number | null {
	if (!summary) return null;
	switch (type) {
		case "listing":
			return summary.pendingListings;
		case "report":
			return summary.pendingReports;
		case "verification":
			return summary.pendingVerifications;
		case "dispute":
			return summary.disputesPending;
		case "risk":
			return summary.openRiskFlags;
		case "payoutAccount":
			return summary.pendingPayoutAccounts;
	}
}

export type OpsSection =
	| "queue"
	| "reports"
	| "verification"
	| "disputes"
	| "risk"
	| "shops"
	| "log";

export const OPS_SECTIONS: { key: OpsSection; href: string }[] = [
	{ key: "queue", href: "/moderation" },
	{ key: "reports", href: "/moderation/reports" },
	{ key: "verification", href: "/moderation/verification" },
	{ key: "disputes", href: "/moderation/disputes" },
	{ key: "risk", href: "/moderation/risk" },
	{ key: "shops", href: "/moderation/shops" },
	{ key: "log", href: "/moderation/log" },
];

/** The queue entry is active on `/moderation` alone, not on every section below it. */
export function isSectionActive(pathname: string, href: string): boolean {
	if (href === "/moderation") return pathname === href;
	return pathname === href || pathname.startsWith(`${href}/`);
}

/** The sidebar badge: the queue's own total, the summary's count elsewhere, nothing for shops and the log. */
export function sectionCount(
	section: OpsSection,
	summary: ModerationSummary | undefined,
	queueTotal: number | undefined,
): number | null {
	switch (section) {
		case "queue":
			return queueTotal ?? null;
		case "reports":
			return summary ? summary.pendingReports + summary.pendingListings : null;
		case "verification":
			return typeCount(summary, "verification");
		case "disputes":
			return typeCount(summary, "dispute");
		case "risk":
			return typeCount(summary, "risk");
		default:
			return null;
	}
}
