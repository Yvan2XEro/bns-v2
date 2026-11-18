/**
 * How long ago something happened, in the visitor's language ("il y a 5 h",
 * "5 hours ago"), through `Intl.RelativeTimeFormat` rather than English
 * suffixes. Past `maxDays` it switches to the plain date.
 */
export function timeAgo(
	date: string | Date,
	locale: string,
	{ now = new Date(), maxDays = 7 }: { now?: Date; maxDays?: number } = {},
): string {
	const then = new Date(date);
	const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
	const rtf = new Intl.RelativeTimeFormat(locale, {
		numeric: "auto",
		style: "short",
	});
	if (seconds < 60) return rtf.format(0, "second");
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return rtf.format(-minutes, "minute");
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return rtf.format(-hours, "hour");
	const days = Math.floor(hours / 24);
	if (days < maxDays) return rtf.format(-days, "day");
	return then.toLocaleDateString(locale);
}
