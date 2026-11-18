import { z } from "zod";
import type { DeliveryWindow } from "../../../api/src/lib/delivery/eta";
import type { RescheduleDay } from "./shipment-tracking";

export const rescheduleSchema = z
	.object({
		day: z.string().min(1, "dayRequired"),
		window: z.enum(["morning", "afternoon", "evening"], {
			message: "windowRequired",
		}),
		landmark: z
			.string()
			.trim()
			.refine(
				(value) => value === "" || (value.length >= 5 && value.length <= 200),
				"landmarkLength",
			),
		lat: z.string(),
		lng: z.string(),
	})
	.superRefine((value, ctx) => {
		const pinned = value.lat !== "" || value.lng !== "";
		const latitude = Number(value.lat);
		const longitude = Number(value.lng);
		if (
			pinned &&
			(value.lat === "" ||
				value.lng === "" ||
				!(latitude >= -90 && latitude <= 90) ||
				!(longitude >= -180 && longitude <= 180))
		) {
			ctx.addIssue({
				code: "custom",
				path: ["lat"],
				message: "positionInvalid",
			});
		}
	});

export type RescheduleValues = z.infer<typeof rescheduleSchema>;

/** The request body of `POST /api/shipments/{id}/reschedule`; there is no phone field to send. */
export interface RescheduleInput {
	date: string;
	window: DeliveryWindow;
	landmark?: string;
	gps?: { lat: number; lng: number };
}

/** The instant is the chosen day's chosen window start; null when that pairing is not on offer. */
export function toRescheduleInput(
	values: RescheduleValues,
	choices: readonly RescheduleDay[],
): RescheduleInput | null {
	const slot = choices
		.find((day) => day.key === values.day)
		?.windows.find((entry) => entry.window === values.window);
	if (!slot) return null;
	const landmark = values.landmark.trim();
	return {
		date: slot.iso,
		window: values.window,
		...(landmark ? { landmark } : {}),
		...(values.lat !== "" && values.lng !== ""
			? { gps: { lat: Number(values.lat), lng: Number(values.lng) } }
			: {}),
	};
}
