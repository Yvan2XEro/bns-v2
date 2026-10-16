import type { DeliveryOption } from "./deliveryQuote";

export interface CheckoutGroupShop {
	id: string;
	name: string;
	handle: string;
	city: string | null;
}

export interface CheckoutGroupOrderView {
	id: string;
	orderNumber: string;
	shop: CheckoutGroupShop;
	total: number;
	currency: string;
	paymentMethod: "cod" | "mobile_money";
	status: string;
	paymentStatus: string;
	/** Server-decided: a protected order still inside its checkout window. */
	payableNow: boolean;
}

/** GET /api/checkout/groups/{checkoutGroup}: the buyer's split, one row per order. */
export interface CheckoutGroupView {
	checkoutGroup: string;
	orders: CheckoutGroupOrderView[];
}

// The split cart/quote/place views cross the web boundary, so they live in
// the shipped contracts slice; the services re-export them for api callers.

export interface CartShopView {
	id: string;
	name: string;
	handle: string;
	city: string | null;
	/** Cart views only (the shop header): absent from quote and placement answers. */
	logoUrl?: string | null;
	brandColor?: string | null;
	badge?: "phone" | "identity" | "business" | null;
	rating?: number;
	totalReviews?: number;
	/** Cart and quote seller card: the shop's first public pickup point ("Rue Joffre, Akwa, Douala"), null when it lists none. */
	address?: string | null;
	/** Cart and quote seller card: the year the shop opened, for « Boutique depuis 2024 ». */
	sinceYear?: number | null;
}

export interface CartLineView {
	/** The array row id, which is what the line routes address. */
	id: string;
	listingId: string;
	productId: string;
	variantId: string;
	shopId: string;
	title: string;
	variantLabel: string;
	imageUrl: string | null;
	quantity: number;
	/** The price now, which is what the buyer would be charged. Falls back to `priceAtAdd` when the listing or variant can no longer be read at all — such a line is never `available`, so the fallback renders a row rather than pricing one. */
	unitPrice: number;
	priceAtAdd: number;
	priceChanged: boolean;
	lineSubtotal: number;
	available: boolean;
	/** The cap the stepper may raise this line to; null when the variant is untracked. */
	maxQuantity: number | null;
	/** Units still on sale, for the "n left" hint: exact only up to `PUBLIC_STOCK_CAP`, otherwise (or untracked) null. */
	stockLeft?: number | null;
}

/** One line of the quote, as the checkout screen renders it: what it is, how many, what it costs. The ids `placeOrder` needs stay on `QuoteSummaryItem`, off the wire. */
export interface QuoteSummaryLine {
	title: string;
	variantLabel: string;
	unitPrice: number;
	quantity: number;
	lineSubtotal: number;
	imageUrl: string | null;
}

export interface SplitCartGroup {
	/** `{storefrontShopId}:{fulfillingShopId}`. */
	groupKey: string;
	storefrontShop: CartShopView;
	fulfillingShop: CartShopView;
	resale: boolean;
	items: CartLineView[];
	subtotal: number;
}

/** What `GET /api/cart` answers while `multiShopCartEnabled` is on. */
export interface SplitCartView {
	id: string | null;
	/** Null while the cart is empty, hence bound to no market. */
	market: { countryCode: string; currency: string } | null;
	groups: SplitCartGroup[];
	grandSubtotal: number;
}

export interface SplitQuoteGroup {
	groupKey: string;
	storefrontShop: CartShopView;
	fulfillingShop: CartShopView;
	resale: boolean;
	items: QuoteSummaryLine[];
	subtotal: number;
	delivery: { options: DeliveryOption[]; unavailable: string[] };
	selectedOptionId: string;
	deliveryFee: number;
	/** VAT on the platform commission of this group, at the market's rate. */
	vat: number;
	total: number;
	/** Bound to this group: it validates no other group's placement. */
	quoteHash: string;
}

export interface SplitQuoteView {
	market: { countryCode: string; currency: string };
	groups: SplitQuoteGroup[];
	unavailableGroups: Array<{ groupKey: string; reason: string }>;
	grandTotal: number;
	quoteHash: string;
}

export interface SplitPlaceResponse {
	checkoutGroup: string;
	orders: Array<{
		id: string;
		orderNumber: string;
		shop: CartShopView;
		total: number;
		currency: string;
		paymentMethod: "cod" | "mobile_money";
	}>;
}
