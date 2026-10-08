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
	};
	rates: {
		sellerCancellation: number | null;
		codRefusal: number | null;
		deliveryCompletion: number | null;
	};
	responseTime: {
		medianBucket: ResponseBucket | null;
		answeredWithinOneHour: number | null;
		awaitingReply: number;
		buckets: Record<ResponseBucket, number>;
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
	};
	actions: ShopInsightAction[];
}
