export type InsightsPeriod = "7d" | "30d" | "90d";
export type ResponseBucket = "m5" | "m15" | "h1" | "h4" | "h24" | "over24h";

export interface ShopInsightsTotals {
	views: number;
	conversationsStarted: number;
	ordersPlaced: number;
	ordersDelivered: number;
	gmvDelivered: number;
	unitsDelivered: number;
}

export type ShopInsightAction = {
	type:
		| "awaiting_reply"
		| "out_of_stock_views"
		| "restock"
		| "cod_refusal_rate"
		| "seller_cancellation_rate"
		| "low_conversion"
		| "slow_response";
	href: string;
	count?: number;
	productId?: string;
};

export interface ShopInsightsView {
	period: InsightsPeriod;
	from: string;
	to: string;
	totals: {
		current: ShopInsightsTotals;
		previous: ShopInsightsTotals;
		delta: ShopInsightsTotals;
	};
	funnel: {
		views: number;
		engaged: number;
		ordersPlaced: number;
		ordersDelivered: number;
		conversion: number | null;
		/**
		 * The low-conversion product's price against other sellers' published
		 * listings in its category and city; null under five listings.
		 */
		priceComparison?: {
			productId: string;
			medianPrice: number;
			yourPrice: number;
			sample: number;
		} | null;
	};
	rates: {
		sellerCancellation: number | null;
		codRefusal: number | null;
		deliveryCompletion: number | null;
	};
	/** The counts behind `rates`, and the levels at which an action is raised. */
	rateCounts?: {
		sellerCancellations: number;
		ordersPlaced: number;
		codRefused: number;
		codShipped: number;
	};
	thresholds?: { sellerCancellation: number; codRefusal: number };
	/** Placed (or confirmed) to accepted, over orders accepted in the period. */
	acceptance?: { medianMinutes: number | null; sample: number };
	/** Eight rolling 7-day windows ending today, oldest first. */
	weekly?: {
		from: string;
		to: string;
		gmvDelivered: number;
		ordersDelivered: number;
	}[];
	responseTime: {
		medianBucket: ResponseBucket | null;
		answeredWithinOneHour: number | null;
		awaitingReply: number;
		buckets: Record<ResponseBucket, number>;
		/** Median minutes to the first reply per day, last 7 days (14 for longer periods). */
		daily?: { date: string; medianMinutes: number | null; answered: number }[];
	};
	daily: {
		date: string;
		views: number;
		ordersPlaced: number;
		gmvDelivered: number;
	}[];
	topProducts: {
		productId: string;
		productTitle: string;
		listingId: string | null;
		views: number;
		ordersPlaced: number;
		unitsDelivered: number;
		gmvDelivered: number;
		/** Sum over the product's tracked variants; null when none is tracked. */
		available?: number | null;
	}[];
	stock: {
		turnover: number | null;
		restock: {
			variantId: string;
			productId: string;
			productTitle: string;
			daysOfCover: number;
			available: number;
			averageDailyUnits: number;
		}[];
		outOfStockWithViews: {
			variantId: string;
			productId: string;
			productTitle: string;
			views: number;
		}[];
		/** In stock, no unit delivered in the last 30 days; costliest first. */
		dormant?: {
			productId: string;
			productTitle: string;
			available: number;
			costValue: number;
			/** Latest delivered sale of the product; null when it never sold. */
			lastSaleAt?: string | null;
			daysSinceLastSale?: number | null;
			/** The listing the viewer may boost now; null otherwise. */
			boostListingId?: string | null;
		}[];
		dormantValue?: number;
	};
	actions: ShopInsightAction[];
}
