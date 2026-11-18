import { z } from "zod";
import type { ShopShipmentView } from "../../../api/src/contracts/shipments";
import type { Courier } from "../../../api/src/payload-types";
import { courierCostHint, couriersForCity } from "./delivery-zone-form";
import { E164_PATTERN } from "./phone-input";
import type { FailureReason } from "./shipment-status";

/**
 * What the shop can do to one shipment, from the shipment itself. Each row is
 * read off the landed services (`handover.ts`, `attempts.ts`,
 * `courierShipments.ts`, `codRemittance.ts`) and the status-changing ones are
 * held to `SHIPMENT_TRANSITIONS` by
 * `packages/api/tests/int/shipment-panel-parity.int.spec.ts`.
 */
export type PanelAction =
	| "start"
	| "ready_for_pickup"
	| "handover"
	| "declare_delivered"
	| "report_attempt"
	| "reschedule"
	| "mark_returned"
	| "assign_rider"
	| "rider_link"
	| "switch_carrier"
	| "confirm_remittance";

/** The shipment status each status-changing action asks the transition table for. */
export const PANEL_TRANSITION_TARGET = {
	start: "in_transit",
	handover: "delivered",
	declare_delivered: "delivered",
	report_attempt: "failed",
	mark_returned: "returned",
} as const satisfies Partial<Record<PanelAction, ShopShipmentView["status"]>>;

/** The route segment under `/api/shipments/{id}/` each action posts to. */
export const PANEL_ACTION_ROUTES: Record<PanelAction, string> = {
	start: "start",
	ready_for_pickup: "ready-for-pickup",
	handover: "handover",
	declare_delivered: "declare-delivered",
	report_attempt: "attempts",
	reschedule: "reschedule",
	mark_returned: "returned",
	assign_rider: "rider",
	rider_link: "rider-link",
	switch_carrier: "carrier",
	confirm_remittance: "cod-remittance",
};

type PanelShipment = Pick<
	ShopShipmentView,
	| "status"
	| "carrier"
	| "method"
	| "readyForPickupAt"
	| "finalFailure"
	| "rider"
	| "codCollection"
>;

export interface PanelContext {
	/** `costs.view`, which the remittance route demands of the shop member. */
	costsView: boolean;
}

export function panelActions(
	shipment: PanelShipment,
	context: PanelContext,
): PanelAction[] {
	const { status, carrier, method } = shipment;
	const finalFailure = Boolean(shipment.finalFailure?.at);
	const actions: PanelAction[] = [];
	const add = (...list: PanelAction[]) => actions.push(...list);

	if (status === "delivered") {
		if (
			context.costsView &&
			shipment.codCollection?.remittanceStatus === "declared_remitted"
		) {
			add("confirm_remittance");
		}
		return actions;
	}
	if (status === "returned" || status === "cancelled") return actions;

	if (method === "pickup") {
		if (status === "pending") {
			add(shipment.readyForPickupAt ? "handover" : "ready_for_pickup");
		}
		if (status === "failed") add("mark_returned");
		return actions;
	}

	if (carrier === "courier") {
		if (status === "pending") add("switch_carrier");
		if (status === "failed") {
			if (!finalFailure) add("reschedule");
			add("mark_returned");
		}
		return actions;
	}

	const withRider = shipment.rider?.phone ? (["rider_link"] as const) : [];
	if (status === "pending") {
		add("start", "assign_rider", ...withRider, "switch_carrier");
	} else if (status === "picked_up" || status === "in_transit") {
		add(
			"handover",
			"declare_delivered",
			"report_attempt",
			"assign_rider",
			...withRider,
		);
	} else if (status === "failed") {
		if (!finalFailure) add("start", "reschedule", "assign_rider", ...withRider);
		add("mark_returned");
	}
	return actions;
}

export type RiderLinkState = "none" | "active" | "expired" | "revoked";

export function riderLinkState(
	link: ShopShipmentView["riderLink"],
	now: Date,
): RiderLinkState {
	if (!link?.createdAt) return "none";
	if (link.revokedAt) return "revoked";
	if (link.expiresAt && Date.parse(link.expiresAt) <= now.getTime()) {
		return "expired";
	}
	return "active";
}

export const handoverCodeSchema = z.object({
	code: z.string().regex(/^\d{4}$/, "codeFormat"),
});
export type HandoverCodeValues = z.infer<typeof handoverCodeSchema>;

export const externalRiderSchema = z.object({
	name: z.string().trim().min(1, "nameRequired").max(120, "nameRequired"),
	phone: z.string().regex(E164_PATTERN, "phoneInvalid"),
});
export type ExternalRiderValues = z.infer<typeof externalRiderSchema>;

/** The eight reasons, as the vocabulary map holds them (a test compares the two). */
export const ATTEMPT_REASONS = [
	"refused",
	"absent",
	"unreachable",
	"address_not_found",
	"rescheduled_by_buyer",
	"not_collected",
	"damaged",
	"other",
] as const satisfies readonly FailureReason[];

export const attemptSchema = z.object({
	reason: z.enum(ATTEMPT_REASONS),
	note: z.string().trim().max(300, "noteLength"),
});
export type AttemptValues = z.infer<typeof attemptSchema>;

export const returnSchema = attemptSchema.pick({ reason: true });

/** An external Maps link, from a recorded point; never an embedded map. */
export function gpsLink(
	gps: { lat?: number | null; lng?: number | null } | null | undefined,
): string | null {
	if (typeof gps?.lat !== "number" || typeof gps.lng !== "number") return null;
	return `https://www.google.com/maps/search/?api=1&query=${gps.lat},${gps.lng}`;
}

/** The COD collected and who collected it, when there is something to confirm. */
export function remittanceNeedsConfirmation(
	shipment: Pick<ShopShipmentView, "codCollection">,
): boolean {
	return shipment.codCollection?.remittanceStatus === "declared_remitted";
}

function record(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

const text = (value: unknown) =>
	typeof value === "string" && value !== "" ? value : null;

export interface PanelDestination {
	recipientName: string | null;
	phone: string | null;
	city: string | null;
	district: string | null;
	landmark: string | null;
	gps: { lat: number; lng: number } | null;
}

/** `destination` is a free-form snapshot on the document; this reads the keys the shop panel shows. */
export function shipmentDestination(
	shipment: Pick<ShopShipmentView, "destination">,
): PanelDestination {
	const raw = record(shipment.destination);
	const gps = record(raw.gps);
	return {
		recipientName: text(raw.recipientName),
		phone: text(raw.phone),
		city: text(raw.city),
		district: text(raw.district),
		landmark: text(raw.landmark),
		gps:
			typeof gps.lat === "number" && typeof gps.lng === "number"
				? { lat: gps.lat, lng: gps.lng }
				: null,
	};
}

export interface CourierChoice {
	courier: Courier;
	tariff: ReturnType<typeof courierCostHint>;
}

/**
 * The registry couriers worth offering for this parcel: they serve its city,
 * take cash when it is a COD order, and show the tariff they would quote for
 * its district. The carrier route still refuses an unavailable one.
 */
export function eligibleCouriers(
	couriers: readonly Courier[],
	destination: Pick<PanelDestination, "city" | "district">,
	cod: boolean,
): CourierChoice[] {
	const city = destination.city ?? "";
	return couriersForCity(couriers, city)
		.filter((courier) => !cod || courier.supportsCod === true)
		.map((courier) => ({
			courier,
			tariff: courierCostHint(
				courier,
				city,
				destination.district ? [destination.district] : [],
			),
		}));
}
