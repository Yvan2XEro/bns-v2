/** Consumed by next.config.ts redirects(). permanent: true answers 308 —
 * SMS, bookmarks and the mobile in-app browser cannot be re-educated, so
 * this row is never removed. */
export const PERMANENT_REDIRECTS = [
	{
		source: "/shop/manage",
		destination: "/seller/settings",
		permanent: true,
	},
] as const;
