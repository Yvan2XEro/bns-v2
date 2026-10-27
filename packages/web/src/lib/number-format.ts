/** The thousands separator a locale writes, e.g. a narrow space in French. */
export function groupSeparator(locale: string): string {
	return (
		new Intl.NumberFormat(locale)
			.formatToParts(12345)
			.find((part) => part.type === "group")?.value ?? " "
	);
}

/** What a number field hands its form: the digits only, "" when empty. */
export function digitsOf(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "";
	return String(value).replace(/\D/g, "");
}
