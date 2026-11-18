import { z } from "zod";
import { FAILURE_REASONS } from "./types";

export const deliveryCoordinatesSchema = z
	.object({
		lat: z.number().min(-90).max(90),
		lng: z.number().min(-180).max(180),
	})
	.strict();

export const reportAttemptSchema = z
	.object({
		reason: z.enum(FAILURE_REASONS),
		note: z.string().trim().max(300).optional(),
		gps: deliveryCoordinatesSchema.optional(),
		photoId: z.string().trim().min(1).optional(),
	})
	.strict();

export const rescheduleShipmentSchema = z
	.object({
		date: z.string().datetime(),
		window: z.enum(["morning", "afternoon", "evening"]),
		landmark: z.string().trim().min(5).max(200).optional(),
		gps: deliveryCoordinatesSchema.optional(),
		note: z.string().trim().max(300).optional(),
	})
	.strict();

export const returnedShipmentSchema = z
	.object({ reason: z.enum(FAILURE_REASONS).optional() })
	.strict();

export const riderHandoverSchema = z
	.object({
		code: z.string().trim().length(4),
		gps: deliveryCoordinatesSchema.optional(),
		photoId: z.string().trim().min(1).optional(),
		recipientName: z.string().trim().min(1).max(120).optional(),
	})
	.strict();
