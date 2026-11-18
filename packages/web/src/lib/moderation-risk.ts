/**
 * URL state, labels and decision bodies for the console's Risk section.
 * The decisions offered are exactly those `POST /api/moderation/risk-flags/:id`
 * accepts for a flag whose subject the detail route identifies; actions that
 * need an id the detail does not return (a hold, a resale link, an order)
 * stay with the mobile flow and the shop sheet.
 */
import type {
	RiskAutoEffect,
	RiskFlagDecisionInput,
	RiskFlagQueueItem,
	RiskFlagStats,
	RiskResolution,
	RiskStatus,
	RiskSubjectType,
} from "../../../api/src/contracts/moderationConsole";
import { query } from "./shop-api";

export const RISK_TABS = [
	"open",
	"shop",
	"user",
	"phone",
	"device",
	"reviewed",
	"dismissed",
] as const;
export type RiskTab = (typeof RISK_TABS)[number];

export const RISK_TAB_LABELS: Record<RiskTab, string> = {
	open: "risk.tab.open",
	shop: "risk.tab.shop",
	user: "risk.tab.user",
	phone: "risk.tab.phone",
	device: "risk.tab.device",
	reviewed: "risk.tab.reviewed",
	dismissed: "risk.tab.dismissed",
};

export function parseRiskTab(value: string | null): RiskTab {
	return value && (RISK_TABS as readonly string[]).includes(value)
		? (value as RiskTab)
		: "open";
}

/** The flags list for a tab: open flags by subject type, or a decided status. */
export function riskFlagsPath(tab: RiskTab, cursor?: string | null): string {
	const status: RiskStatus =
		tab === "reviewed" || tab === "dismissed" ? tab : "open";
	const subjectType =
		tab === "open" || tab === "reviewed" || tab === "dismissed"
			? undefined
			: tab;
	return `/api/moderation/risk-flags${query({ status, subjectType, cursor })}`;
}

export function riskTabHref(pathname: string, tab: RiskTab): string {
	return tab === "open" ? pathname : `${pathname}?tab=${tab}`;
}

export function riskTabCount(
	stats: RiskFlagStats | undefined,
	tab: RiskTab,
): number | null {
	if (!stats) return null;
	switch (tab) {
		case "open":
			return stats.open;
		case "reviewed":
			return stats.reviewed;
		case "dismissed":
			return null;
		default:
			return stats.openBySubject[tab];
	}
}

/** Share of the last 30 days' decisions that were dismissals, as a whole percentage. */
export function falsePositiveRate(stats: RiskFlagStats): number | null {
	if (stats.decidedLast30Days === 0) return null;
	return Math.round(
		(stats.dismissedLast30Days / stats.decidedLast30Days) * 100,
	);
}

export type RiskStatusView =
	| "new"
	| "mine"
	| "inReview"
	| "monitored"
	| "dismissed"
	| "actioned";

export function riskStatusView(
	flag: Pick<RiskFlagQueueItem, "status" | "assignedTo">,
	viewerId: string | null,
): RiskStatusView {
	switch (flag.status) {
		case "reviewed":
			return "monitored";
		case "dismissed":
			return "dismissed";
		case "actioned":
			return "actioned";
		default:
			if (!flag.assignedTo) return "new";
			return flag.assignedTo === viewerId ? "mine" : "inReview";
	}
}

export const RISK_STATUS_LABELS: Record<RiskStatusView, string> = {
	new: "risk.status.new",
	mine: "risk.status.mine",
	inReview: "risk.status.inReview",
	monitored: "risk.status.monitored",
	dismissed: "risk.status.dismissed",
	actioned: "risk.status.actioned",
};

export const RISK_SUBJECT_LABELS: Record<RiskSubjectType, string> = {
	user: "target.user",
	shop: "target.shop",
	phone: "target.phone",
	device: "target.device",
};

export const AUTO_EFFECT_LABELS: Record<RiskAutoEffect, string> = {
	payout_hold: "risk.autoEffect.payout_hold",
	commission_hold: "risk.autoEffect.commission_hold",
	limit_applied: "risk.autoEffect.limit_applied",
};

export const RESOLUTION_LABELS: Record<RiskResolution, string> = {
	none: "risk.resolution.none",
	warned: "risk.resolution.warned",
	limited: "risk.resolution.limited",
	user_suspended: "risk.resolution.user_suspended",
	shop_suspended: "risk.resolution.shop_suspended",
	payouts_held: "risk.resolution.payouts_held",
	resale_link_suspended: "risk.resolution.resale_link_suspended",
	order_cancelled: "risk.resolution.order_cancelled",
	false_positive: "risk.resolution.false_positive",
};

interface NamedRef {
	id: string;
	name: string | null;
}

/** What the detail route's free-form `subject` holds, per subject type. */
export type RiskSubjectView =
	| {
			type: "user";
			id: string;
			name: string | null;
			accountAgeDays: number | null;
			level: number | null;
			shops: (NamedRef & { status: string | null; level: number | null })[];
	  }
	| {
			type: "shop";
			id: string;
			name: string | null;
			level: number | null;
			status: string | null;
			sellerCancellationRate: number | null;
			openDisputes: number | null;
	  }
	| {
			type: "phone" | "device";
			label: string | null;
			linkedUsers: string[];
			linkedShops: string[];
	  };

const str = (value: unknown): string | null =>
	typeof value === "string" && value ? value : null;
const num = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;
const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value))
		: {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function riskSubjectView(
	subject: Record<string, unknown>,
): RiskSubjectView | null {
	const type = subject.type;
	if (type === "user") {
		const id = str(subject.id);
		if (!id) return null;
		return {
			type,
			id,
			name: str(subject.name),
			accountAgeDays: num(subject.accountAgeDays),
			level: num(subject.level),
			shops: list(subject.shops).flatMap((entry) => {
				const shop = record(entry);
				const shopId = str(shop.id);
				return shopId
					? [
							{
								id: shopId,
								name: str(shop.name),
								status: str(shop.status),
								level: num(shop.level),
							},
						]
					: [];
			}),
		};
	}
	if (type === "shop") {
		const id = str(subject.id);
		if (!id) return null;
		return {
			type,
			id,
			name: str(subject.name),
			level: num(subject.level),
			status: str(subject.status),
			sellerCancellationRate: num(record(subject.rates).sellerCancellation),
			openDisputes: num(subject.openDisputes),
		};
	}
	if (type === "phone" || type === "device") {
		const ids = (value: unknown) =>
			list(value).flatMap((id) => (str(id) ? [String(id)] : []));
		return {
			type,
			label: str(subject.label),
			linkedUsers: ids(subject.linkedUsers),
			linkedShops: ids(subject.linkedShops),
		};
	}
	return null;
}

export type RiskDecisionChoice =
	| "dismiss"
	| "monitor"
	| "suspend_shop"
	| "hold_payouts"
	| "suspend_user";

export const RISK_DECISION_LABELS: Record<
	RiskDecisionChoice,
	{ title: string; body: string }
> = {
	dismiss: {
		title: "risk.decision.dismiss",
		body: "risk.decision.dismissBody",
	},
	monitor: {
		title: "risk.decision.monitor",
		body: "risk.decision.monitorBody",
	},
	suspend_shop: {
		title: "risk.decision.suspend_shop",
		body: "risk.decision.suspend_shopBody",
	},
	hold_payouts: {
		title: "risk.decision.hold_payouts",
		body: "risk.decision.hold_payoutsBody",
	},
	suspend_user: {
		title: "risk.decision.suspend_user",
		body: "risk.decision.suspend_userBody",
	},
};

/**
 * Open flags can be watched, dismissed or acted on; a flag already under
 * watch can still be dismissed or acted on (the server allows it for 30
 * days). Sanctions need the subject's id, which only user and shop subjects
 * carry.
 */
export function availableDecisions(
	status: RiskStatus,
	subject: RiskSubjectView | null,
): RiskDecisionChoice[] {
	if (status !== "open" && status !== "reviewed") return [];
	const choices: RiskDecisionChoice[] = ["dismiss"];
	if (status === "open") choices.push("monitor");
	if (subject?.type === "shop") choices.push("suspend_shop", "hold_payouts");
	if (subject?.type === "user") choices.push("suspend_user");
	return choices;
}

export function needsDuration(choice: RiskDecisionChoice): boolean {
	return (
		choice === "suspend_shop" ||
		choice === "suspend_user" ||
		choice === "hold_payouts"
	);
}

/** Every decision but watching needs a written reason (the API refuses it otherwise). */
export function needsNote(choice: RiskDecisionChoice): boolean {
	return choice !== "monitor";
}

/**
 * `null` is "until lifted". Moderators suspend for at most 30 days and only
 * an administrator may suspend indefinitely; a payout hold may always run
 * until released.
 */
export function durationChoices(
	choice: RiskDecisionChoice,
	isAdmin: boolean,
): (number | null)[] {
	if (!needsDuration(choice)) return [];
	return choice === "hold_payouts" || isAdmin ? [7, 30, null] : [7, 30];
}

export function riskDecisionBody(
	choice: RiskDecisionChoice,
	input: {
		subject: RiskSubjectView | null;
		note: string;
		durationDays: number | null;
	},
): RiskFlagDecisionInput | null {
	const note = input.note.trim();
	if (note.length > 2000) return null;
	if (needsNote(choice) && !note) return null;
	const subject = input.subject;
	switch (choice) {
		case "dismiss":
			return { outcome: "dismissed", resolution: "false_positive", note };
		case "monitor":
			return {
				outcome: "reviewed",
				resolution: "none",
				...(note ? { note } : {}),
			};
		case "suspend_shop":
			if (subject?.type !== "shop") return null;
			return {
				outcome: "actioned",
				resolution: "shop_suspended",
				note,
				action: {
					type: "suspend_shop",
					targetId: subject.id,
					reason: "fraud",
					durationDays: input.durationDays,
				},
			};
		case "hold_payouts":
			if (subject?.type !== "shop") return null;
			return {
				outcome: "actioned",
				resolution: "payouts_held",
				note,
				action: {
					type: "hold_payouts",
					targetId: subject.id,
					reason: "moderation",
					durationDays: input.durationDays,
				},
			};
		case "suspend_user":
			if (subject?.type !== "user") return null;
			return {
				outcome: "actioned",
				resolution: "user_suspended",
				note,
				action: {
					type: "suspend_user",
					targetId: subject.id,
					reason: "fraud",
					durationDays: input.durationDays,
				},
			};
	}
}

/** Evidence values come as raw scalars; booleans and nulls get words, numbers the locale. */
export function evidenceValue(
	value: string | number | boolean | null,
	locale: string,
): { key: "yes" | "no" | "none" } | { text: string } {
	if (value === null) return { key: "none" };
	if (typeof value === "boolean") return { key: value ? "yes" : "no" };
	if (typeof value === "number")
		return { text: new Intl.NumberFormat(locale).format(value) };
	return { text: value };
}
