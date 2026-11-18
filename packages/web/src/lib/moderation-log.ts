/**
 * The moderation log's filters, kept in the URL, the API query they make,
 * and where each logged target opens in the console.
 */
import type {
	ModerationLogAction,
	ModerationLogTargetType,
} from "../../../api/src/contracts/moderationConsole";
import { LOG_ACTION_LABELS } from "./moderation-console";
import { query } from "./shop-api";

export const LOG_TARGET_LABELS: Record<ModerationLogTargetType, string> = {
	listing: "log.targetType.listing",
	user: "log.targetType.user",
	report: "log.targetType.report",
	shop: "log.targetType.shop",
	"verification-request": "log.targetType.verification",
	order: "log.targetType.order",
	"commission-invoice": "log.targetType.commissionInvoice",
	dispute: "log.targetType.dispute",
	"resale-link": "log.targetType.resaleLink",
	"risk-flag": "log.targetType.riskFlag",
	review: "log.targetType.review",
};

/** `actorRole` is a free-text snapshot; these are the values the API writes. */
export const LOG_ROLE_LABELS: Record<"moderator" | "admin" | "system", string> =
	{
		moderator: "log.role.moderator",
		admin: "log.role.admin",
		system: "log.role.system",
	};

const has = <K extends string>(map: Record<K, string>, key: string): key is K =>
	Object.hasOwn(map, key);

export function logRoleLabel(role: string): string | null {
	return has(LOG_ROLE_LABELS, role) ? LOG_ROLE_LABELS[role] : null;
}

export const isLogTargetType = (
	value: string,
): value is ModerationLogTargetType => has(LOG_TARGET_LABELS, value);

export const isLogAction = (value: string): value is ModerationLogAction =>
	has(LOG_ACTION_LABELS, value);

/** The API takes a moderator by account id (a 24-hex ObjectId), nothing else. */
export const isAccountId = (value: string) => /^[0-9a-f]{24}$/i.test(value);

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface LogFilters {
	action?: ModerationLogAction;
	targetType?: ModerationLogTargetType;
	targetId?: string;
	actor?: string;
	/** Calendar days (`YYYY-MM-DD`), both inclusive. */
	from?: string;
	to?: string;
}

export function parseLogFilters(params: {
	get(name: string): string | null;
}): LogFilters {
	const action = params.get("action") ?? "";
	const targetType = params.get("targetType") ?? "";
	const targetId = params.get("targetId")?.trim().slice(0, 100) ?? "";
	const actor = params.get("actor")?.trim() ?? "";
	const from = params.get("from") ?? "";
	const to = params.get("to") ?? "";
	return {
		action: isLogAction(action) ? action : undefined,
		targetType: isLogTargetType(targetType) ? targetType : undefined,
		targetId: targetId || undefined,
		actor: isAccountId(actor) ? actor : undefined,
		from: DAY.test(from) ? from : undefined,
		to: DAY.test(to) ? to : undefined,
	};
}

export function logHref(pathname: string, filters: LogFilters): string {
	return `${pathname}${query({ ...filters })}`;
}

export function hasLogFilters(filters: LogFilters): boolean {
	return Object.values(filters).some(Boolean);
}

/** A day read in the moderator's own time zone, from its first to its last millisecond. */
function dayBound(day: string, end: boolean): string {
	const [year, month, date] = day.split("-").map(Number);
	const bound = end
		? new Date(year, month - 1, date, 23, 59, 59, 999)
		: new Date(year, month - 1, date);
	return bound.toISOString();
}

export function logPath(
	filters: LogFilters,
	options: { cursor?: string | null; format?: "csv" } = {},
): string {
	return `/api/moderation/log${query({
		action: filters.action,
		targetType: filters.targetType,
		targetId: filters.targetId,
		actor: filters.actor,
		from: filters.from ? dayBound(filters.from, false) : undefined,
		to: filters.to ? dayBound(filters.to, true) : undefined,
		cursor: options.cursor,
		format: options.format,
	})}`;
}

/** The console page a logged target opens in, when it has one. */
export function logTargetHref(targetType: string, id: string): string | null {
	const item = (type: string) => encodeURIComponent(`${type}:${id}`);
	const path = encodeURIComponent(id);
	switch (targetType) {
		case "shop":
			return `/moderation/shops/${path}`;
		case "report":
			return `/moderation/reports?item=${item("report")}`;
		case "listing":
			return `/moderation/reports?tab=listings&item=${item("listing")}`;
		case "risk-flag":
			return `/moderation/risk?item=${item("risk")}`;
		case "verification-request":
			return `/moderation/verification/${path}`;
		case "dispute":
			return `/moderation/disputes/${path}`;
		default:
			return null;
	}
}

export function logCsvFilename(now: Date = new Date()): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `moderation-log-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`;
}
