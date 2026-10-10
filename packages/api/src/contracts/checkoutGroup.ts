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
