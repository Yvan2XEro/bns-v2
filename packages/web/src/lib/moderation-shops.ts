/**
 * The moderation console's shop search and shop sheet: URL state, the
 * sheet's shape as `GET /api/moderation/shops/:id` serves it, and the
 * suspension and payout decisions checked the way the API checks them.
 */

import type { Report, ShopActivityView, ShopRole } from "~/types";
import type { ShopStandingView } from "../../../api/src/contracts/disputes";
import type {
	ModerationShopStatus,
	ReportReason,
} from "../../../api/src/contracts/moderationConsole";
import { MODERATION_SHOP_STATUSES } from "../../../api/src/contracts/moderationConsole";
import { REPORT_REASON_LABELS } from "./moderation-console";
import type {
	ConnectedAccountStatus,
	HoldCategory,
	NameMatchVerdict,
	PayoutHoldReason,
	PayoutMethod,
	PayoutStatus,
} from "./payment-status";
import { query } from "./shop-api";

export const SHOP_STATUS_LABELS: Record<ModerationShopStatus, string> = {
	active: "reports.active",
	suspended: "reports.suspended",
	closed: "reports.closed",
};

export interface ShopFilters {
	q?: string;
	status?: ModerationShopStatus;
}

export const isShopStatus = (value: string): value is ModerationShopStatus =>
	(MODERATION_SHOP_STATUSES as readonly string[]).includes(value);

export function parseShopFilters(params: {
	get(name: string): string | null;
}): ShopFilters {
	const q = params.get("q")?.trim().slice(0, 100);
	const status = params.get("status");
	return {
		q: q || undefined,
		status: status && isShopStatus(status) ? status : undefined,
	};
}

export function shopsHref(pathname: string, filters: ShopFilters): string {
	return `${pathname}${query({ q: filters.q, status: filters.status })}`;
}

export function shopsPath(filters: ShopFilters, cursor?: string | null) {
	return `/api/moderation/shops${query({ q: filters.q, status: filters.status, cursor })}`;
}

export const shopSheetHref = (id: string) =>
	`/moderation/shops/${encodeURIComponent(id)}`;

export const shopLogHref = (id: string) =>
	`/moderation/log${query({ targetType: "shop", targetId: id })}`;

// ─── The sheet, as the route serves it ──────────────────────────────────────

type Populated<T> = string | T | null | undefined;

export interface ShopSheetHistoryEntry {
	id: string;
	action: string;
	actor: Populated<{ id: string; name?: string | null; email?: string | null }>;
	reason?: string | null;
	note?: string | null;
	metadata?: unknown;
	createdAt: string;
}

export interface ShopSheetHold {
	id: string;
	scope: "shop" | "order";
	orderId: string | null;
	reason: PayoutHoldReason;
	reasonCategory: HoldCategory;
	blocksCharges: boolean;
	until: string | null;
	createdByType: "system" | "moderator";
	createdBy: string | null;
	note: string | null;
	createdAt: string;
}

export interface ShopSheetPendingAccount {
	id: string;
	method: PayoutMethod;
	accountName: string;
	accountNumberMasked: string;
	nameMatch: null | {
		result: NameMatchVerdict;
		identityName: string | null;
		score: number | null;
	};
	createdAt: string;
}

export interface ShopSheetPayments {
	connectedAccount: null | {
		status: ConnectedAccountStatus;
		chargesEnabled: boolean;
		payoutsEnabled: boolean;
		lastSyncedAt: string | null;
	};
	payoutAccount: null | {
		id: string;
		method: PayoutMethod;
		accountName: string;
		accountNumberMasked: string;
		activatedAt: string | null;
	};
	pendingAccounts: ShopSheetPendingAccount[];
	holds: ShopSheetHold[];
	openExposure: number;
	lastPayouts: Array<{
		id: string;
		amount: number;
		currency: string;
		status: PayoutStatus;
		origin: "platform_release" | "provider_schedule";
		failureReason: string | null;
		createdAt: string;
	}>;
	refundRate: { windowDays: number; orders: number; refundedOrders: number };
}

export interface ModerationShopSheet {
	shop: {
		id: string;
		handle: string;
		name: string;
		status: ModerationShopStatus;
		level: number;
		logo: { id: string; url: string | null } | null;
		createdAt: string;
	};
	owner: null | {
		id: string;
		name: string | null;
		email: string;
		role: string;
		createdAt: string;
	};
	suspension: {
		active: boolean;
		expired: boolean;
		indefinite: boolean;
		since: string | null;
		until: string | null;
		reason: string | null;
		note: string | null;
		by: Populated<{ id: string; name?: string | null }>;
	};
	counts: {
		publishedListings: number;
		activeProducts: number;
		draftProducts: number;
		reportsAgainst: number;
	};
	reports: Report[];
	history: ShopSheetHistoryEntry[];
	team: Array<{
		id: string;
		name: string | null;
		role: ShopRole;
		joinedAt: string | null;
	}>;
	activity: ShopActivityView[];
	payments: ShopSheetPayments;
	standing: ShopStandingView;
}

export function personLabel(
	person: Populated<{
		id: string;
		name?: string | null;
		email?: string | null;
	}>,
): string | null {
	if (!person) return null;
	if (typeof person === "string") return null;
	return person.name || person.email || null;
}

/** The last time a suspension of this shop was lifted, from its sanctions history. */
export function lastLiftedAt(history: ShopSheetHistoryEntry[]): string | null {
	const lifted = history
		.filter((entry) => entry.action === "shop.unsuspend")
		.map((entry) => entry.createdAt)
		.sort();
	return lifted.at(-1) ?? null;
}

// ─── Who may act ────────────────────────────────────────────────────────────

const RANKS: Record<string, number> = { user: 0, moderator: 1, admin: 2 };
const rank = (role: string | null | undefined) => (role && RANKS[role]) || 0;

/**
 * The API's rule (`assertCanActOnShop`): the moderator must outrank the
 * shop's owner and not be the owner. The server check is the one that
 * counts; this only avoids offering a decision it would refuse.
 */
export function canActOnShop(
	viewer: { id?: string | null; role?: string | null } | null | undefined,
	owner: { id: string; role: string } | null | undefined,
): boolean {
	if (!viewer || !owner) return false;
	if (viewer.id && String(viewer.id) === String(owner.id)) return false;
	return (
		rank(viewer.role) >= RANKS.moderator && rank(viewer.role) > rank(owner.role)
	);
}

// ─── Suspension ─────────────────────────────────────────────────────────────

export const SUSPENSION_REASONS = [
	"spam",
	"inappropriate",
	"fraud",
	"prohibited",
	"harassment",
	"other",
] as const satisfies readonly ReportReason[];
export type SuspensionReason = (typeof SUSPENSION_REASONS)[number];

export const SUSPENSION_REASON_LABELS: Record<SuspensionReason, string> = {
	spam: REPORT_REASON_LABELS.spam,
	inappropriate: REPORT_REASON_LABELS.inappropriate,
	fraud: REPORT_REASON_LABELS.fraud,
	prohibited: REPORT_REASON_LABELS.prohibited,
	harassment: REPORT_REASON_LABELS.harassment,
	other: REPORT_REASON_LABELS.other,
};

export const isSuspensionReason = (value: string): value is SuspensionReason =>
	(SUSPENSION_REASONS as readonly string[]).includes(value);

/** A moderator suspends for 30 days at most; only an administrator suspends until lifted. */
export function suspensionDurations(isAdmin: boolean): (number | null)[] {
	return isAdmin ? [1, 7, 30, null] : [1, 7, 30];
}

export const NOTE_MAX = 1000;

export type SuspendBody = {
	action: "suspend";
	reason: SuspensionReason;
	durationDays: number | null;
	note?: string;
};

export type UnsuspendBody = {
	action: "unsuspend";
	restoreListings: boolean;
	note?: string;
};

export function suspendBody(input: {
	reason: string;
	durationDays: number | null;
	note: string;
	isAdmin: boolean;
}): SuspendBody | null {
	if (!isSuspensionReason(input.reason)) return null;
	if (!suspensionDurations(input.isAdmin).includes(input.durationDays))
		return null;
	const note = input.note.trim();
	if (note.length > NOTE_MAX) return null;
	return {
		action: "suspend",
		reason: input.reason,
		durationDays: input.durationDays,
		...(note ? { note } : {}),
	};
}

export function unsuspendBody(input: {
	restoreListings: boolean;
	note: string;
}): UnsuspendBody | null {
	const note = input.note.trim();
	if (note.length > NOTE_MAX) return null;
	return {
		action: "unsuspend",
		restoreListings: input.restoreListings,
		...(note ? { note } : {}),
	};
}

// ─── Payouts ────────────────────────────────────────────────────────────────

export const HOLD_REASON_LABELS: Record<PayoutHoldReason, string> = {
	payout_account_changed: "shop.holdReason.payout_account_changed",
	fraud_signal: "shop.holdReason.fraud_signal",
	reconciliation_mismatch: "shop.holdReason.reconciliation_mismatch",
	dispute_open: "shop.holdReason.dispute_open",
	return_open: "shop.holdReason.return_open",
	moderation: "shop.holdReason.moderation",
	payout_failed_repeatedly: "shop.holdReason.payout_failed_repeatedly",
	shop_suspended: "shop.holdReason.shop_suspended",
};

/** `shop_suspended` is the system's own, put and lifted with the suspension. */
export const MANUAL_HOLD_REASONS: readonly PayoutHoldReason[] = [
	"moderation",
	"fraud_signal",
	"payout_account_changed",
	"reconciliation_mismatch",
	"dispute_open",
	"return_open",
	"payout_failed_repeatedly",
];

export const HOLD_DURATIONS: (number | null)[] = [7, 14, 30, null];

export const PAYOUT_ORIGIN_LABELS: Record<
	ShopSheetPayments["lastPayouts"][number]["origin"],
	string
> = {
	platform_release: "shop.payoutOrigin.platform_release",
	provider_schedule: "shop.payoutOrigin.provider_schedule",
};

export type PayoutActionBody =
	| {
			action: "hold";
			scope: "shop";
			reason: PayoutHoldReason;
			untilDays: number | null;
			note?: string;
	  }
	| { action: "release"; holdId: string; note?: string }
	| {
			action: "approve_account" | "reject_account";
			accountId: string;
			note?: string;
	  };

export function holdBody(input: {
	reason: string;
	untilDays: number | null;
	note: string;
}): PayoutActionBody | null {
	const reason = MANUAL_HOLD_REASONS.find((value) => value === input.reason);
	if (!reason || !HOLD_DURATIONS.includes(input.untilDays)) return null;
	const note = input.note.trim();
	if (note.length > NOTE_MAX) return null;
	return {
		action: "hold",
		scope: "shop",
		reason,
		untilDays: input.untilDays,
		...(note ? { note } : {}),
	};
}

export function withNote<T extends object>(
	body: T,
	text: string,
): (T & { note?: string }) | null {
	const note = text.trim();
	if (note.length > NOTE_MAX) return null;
	return note ? { ...body, note } : body;
}
