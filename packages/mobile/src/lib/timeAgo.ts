import i18next from "i18next";
import { parseDate } from "./formatDate";

/**
 * "3 h", "2 j", "À l'instant": the short age a card or a row has room for,
 * in the app's language. Null when the date is missing or unparsable.
 */
export function compactTimeAgo(
	value: unknown,
	now = Date.now(),
): string | null {
	const date = parseDate(value);
	if (!date) return null;
	const minutes = Math.floor((now - date.getTime()) / 60_000);
	if (minutes < 1) return i18next.t("time.justNow");
	if (minutes < 60) return i18next.t("time.minutesShort", { count: minutes });
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return i18next.t("time.hoursShort", { count: hours });
	const days = Math.floor(hours / 24);
	if (days < 30) return i18next.t("time.daysShort", { count: days });
	return i18next.t("time.monthsShort", { count: Math.floor(days / 30) });
}
