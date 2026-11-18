import { z } from "zod";
import type { OrderSettingsInput } from "~/hooks/use-order-settings";
import type { OrderSettingsView } from "~/types/order";

/** The collection's own ceiling, which `PATCH …/order-settings` also enforces. */
export const MAX_DELIVERY_FEE = 20_000;
export const MAX_ETA_TEXT = 60;
export const MAX_SALES_TERMS = 2_000;
export const MAX_PICKUP_TEXT = 200;

const text = (max: number) => z.string().trim().max(max, "tooLong");

/**
 * The fee stays a string in the form so that "empty" survives as its own
 * answer: it means "charge the city's default", which the server applies
 * when `deliveryFee` is null — a 0 would mean free delivery instead.
 */
export const orderSettingsSchema = z
	.object({
		codEnabled: z.boolean(),
		sellerDeliveryEnabled: z.boolean(),
		deliveryFee: z
			.string()
			.trim()
			.refine(
				(fee) =>
					fee === "" || (/^\d+$/.test(fee) && Number(fee) <= MAX_DELIVERY_FEE),
				"feeInvalid",
			),
		deliveryEtaText: text(MAX_ETA_TEXT),
		pickupEnabled: z.boolean(),
		pickupAddress: text(MAX_PICKUP_TEXT),
		pickupLandmark: text(MAX_PICKUP_TEXT),
		pickupHours: text(MAX_PICKUP_TEXT),
		salesTermsExtra: text(MAX_SALES_TERMS),
	})
	.superRefine((value, ctx) => {
		if (value.pickupEnabled && value.pickupAddress.trim() === "") {
			ctx.addIssue({
				code: "custom",
				path: ["pickupAddress"],
				message: "required",
			});
		}
	});

export type OrderSettingsFormValues = z.infer<typeof orderSettingsSchema>;

export function toFormValues(view: OrderSettingsView): OrderSettingsFormValues {
	return {
		codEnabled: view.codEnabled,
		sellerDeliveryEnabled: view.sellerDeliveryEnabled,
		deliveryFee: view.deliveryFee === null ? "" : String(view.deliveryFee),
		deliveryEtaText: view.deliveryEtaText ?? "",
		pickupEnabled: view.pickupEnabled,
		pickupAddress: view.pickupPoint?.address ?? "",
		pickupLandmark: view.pickupPoint?.landmark ?? "",
		pickupHours: view.pickupPoint?.hours ?? "",
		salesTermsExtra: view.salesTermsExtra ?? "",
	};
}

const orNull = (value: string) => value.trim() || null;

/** `gps` is not edited here, and the server merges only the keys it is sent. */
export function toOrderSettingsInput(
	values: OrderSettingsFormValues,
): OrderSettingsInput {
	const fee = values.deliveryFee.trim();
	return {
		codEnabled: values.codEnabled,
		sellerDeliveryEnabled: values.sellerDeliveryEnabled,
		deliveryFee: fee === "" ? null : Number(fee),
		deliveryEtaText: orNull(values.deliveryEtaText),
		pickupEnabled: values.pickupEnabled,
		pickupPoint: {
			address: orNull(values.pickupAddress),
			landmark: orNull(values.pickupLandmark),
			hours: orNull(values.pickupHours),
		},
		salesTermsExtra: orNull(values.salesTermsExtra),
	};
}

/**
 * The COD ceilings exactly as the API states them for the shop's effective
 * level (with any admin override applied). Checkout enforces that same
 * figure; a client-side table would be a second source free to disagree.
 */
export function capsNotice(view: OrderSettingsView): OrderSettingsView["caps"] {
	return view.caps;
}
