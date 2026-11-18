import type { Payload } from "payload";
import type { DeliveryMethod, DeliveryQuote } from "../contracts/deliveryQuote";
import { getDeliverySettings } from "../lib/deliverySettings";
import type { OrderSettings } from "../lib/orderSettings";
import type { Shop } from "../payload-types";
import { flatQuote } from "./delivery/flatQuote";
import { zoneQuote } from "./delivery/quote";

export type {
	DeliveryOption,
	DeliveryQuote,
	PickupPointSnapshot,
	UnavailableOption,
} from "../contracts/deliveryQuote";
export interface QuoteItem {
	variantId: string;
	quantity: number;
	lineSubtotal: number;
	codAllowed: boolean;
}
export interface DeliveryQuoteInput {
	payload: Payload;
	shop: Pick<Shop, "id" | "location" | "orderSettings">;
	items: readonly QuoteItem[];
	subtotal: number;
	destination: {
		city: string;
		district?: string;
		gps?: { lat: number; lng: number };
		contactName?: string;
		phone?: string;
		landmark?: string;
	};
	method?: DeliveryMethod;
	paymentMethod?: "cod" | "mobile_money";
	settings: OrderSettings;
	now?: Date;
}
export async function quoteDelivery(
	input: DeliveryQuoteInput,
): Promise<DeliveryQuote> {
	const settings = await getDeliverySettings(input.payload);
	if (!settings.zonesEnabled)
		return { options: await flatQuote(input), unavailable: [] };
	return zoneQuote(input, settings);
}
