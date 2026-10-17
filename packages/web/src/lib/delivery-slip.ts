import type { OrderView } from "~/types/order";

/** Cash the rider must collect: the total of a cash-on-delivery order not yet paid. */
export function amountToCollect(
	order: Pick<OrderView, "paymentMethod" | "paymentStatus" | "amounts">,
): number {
	if (order.paymentMethod !== "cod") return 0;
	return order.paymentStatus === "cod_collected" ||
		order.paymentStatus === "paid"
		? 0
		: order.amounts.total;
}

/** The address as it is read aloud at the door, most precise part first. */
export function slipAddress(delivery: OrderView["delivery"]): string[] {
	return [
		delivery.landmark,
		delivery.districtOther ?? delivery.district,
		delivery.city,
	].filter((part): part is string => Boolean(part?.trim()));
}

/** The order ids a slips URL carries, deduplicated, at most fifty. */
export function slipIds(param: string | null): string[] {
	return [...new Set((param ?? "").split(",").filter(Boolean))].slice(0, 50);
}
