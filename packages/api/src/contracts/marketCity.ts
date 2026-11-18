/** A market's city row as the api serves it — in the contracts slice because
 * `launchCities` (shipped to the web image) names it across the boundary. */
export interface MarketCity {
	id: string;
	market: string;
	key: string;
	label: string;
	defaultDeliveryFee: number;
	/** `slug` is stored without the city prefix, as `{city}.{slug}` on the wire. */
	districts: Array<{ slug: string; label: string }>;
	active: boolean;
	sortOrder: number;
}
