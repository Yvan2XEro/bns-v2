import type { CourierShipmentView } from "../../../api/src/contracts/shipments";

export type RiderApiAction = CourierShipmentView["allowedActions"][number];

/** What the rider app can send for each action the API allows. */
export type RiderButton = "pick_up";

/**
 * `picked_up` and `in_transit` are both answered by `POST /api/shipments/{id}/picked-up`,
 * which moves a pending parcel on and starts the run. The other three are done through the
 * rider link the shop or dispatcher shares: no signed-in rider route exists for them, so the
 * app offers no button rather than one that fails.
 */
export function riderButton(action: RiderApiAction): RiderButton | null {
	switch (action) {
		case "picked_up":
		case "in_transit":
			return "pick_up";
		case "attempt":
		case "handover":
		case "returned":
			return null;
	}
}

export function riderButtons(
	actions: readonly RiderApiAction[],
): RiderButton[] {
	return [...new Set(actions.flatMap((a) => riderButton(a) ?? []))];
}

export type RiderGroup = "today" | "retake" | "done";

export function riderGroup(status: CourierShipmentView["status"]): RiderGroup {
	switch (status) {
		case "pending":
		case "picked_up":
		case "in_transit":
			return "today";
		case "failed":
			return "retake";
		case "delivered":
		case "returned":
		case "cancelled":
			return "done";
	}
}

export interface RiderRow {
	id: string;
	status: CourierShipmentView["status"];
}

export const RIDER_GROUPS: readonly RiderGroup[] = ["today", "retake", "done"];

export function groupRiderRows<T extends RiderRow>(rows: readonly T[]) {
	return RIDER_GROUPS.map((group) => ({
		group,
		rows: rows.filter((row) => riderGroup(row.status) === group),
	})).filter((section) => section.rows.length > 0);
}

/** An external-maps URL for a destination: the pin when there is one, the landmark otherwise. */
export function destinationMapsUrl(
	destination: CourierShipmentView["destination"],
): string | null {
	if (destination.gps)
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${destination.gps.lat},${destination.gps.lng}`)}`;
	const text = [destination.landmark, destination.district, destination.city]
		.filter(Boolean)
		.join(", ");
	return text
		? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`
		: null;
}

export interface ShipmentDestination {
	city: string | null;
	district: string | null;
	landmark: string | null;
	recipientName: string | null;
	phone: string | null;
	gps: { lat: number; lng: number } | null;
}

function text(value: unknown): string | null {
	return typeof value === "string" && value !== "" ? value : null;
}

/** `Shipment.destination` is stored as free JSON; read it without trusting its shape. */
export function readDestination(value: unknown): ShipmentDestination {
	const record =
		typeof value === "object" && value !== null
			? (value as Record<string, unknown>)
			: {};
	const gps = record.gps;
	const point =
		typeof gps === "object" && gps !== null
			? (gps as Record<string, unknown>)
			: null;
	return {
		city: text(record.city),
		district: text(record.district),
		landmark: text(record.landmark),
		recipientName:
			text(record.recipientName) ?? text(record.recipientFirstName),
		phone: text(record.phone),
		gps:
			point && typeof point.lat === "number" && typeof point.lng === "number"
				? { lat: point.lat, lng: point.lng }
				: null,
	};
}

export function mapsUrlFor(point: { lat: number; lng: number }): string {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.lat},${point.lng}`)}`;
}

/** Where the Account entry leads: the dispatcher list beats the rider list; nothing without an active membership. */
export function courierSpaceTarget(
	members: ReadonlyArray<{
		role: "dispatcher" | "rider";
		status: "active" | "revoked";
	}>,
): "/courier" | "/rider" | null {
	const active = members.filter((m) => m.status === "active");
	if (active.some((m) => m.role === "dispatcher")) return "/courier";
	return active.some((m) => m.role === "rider") ? "/rider" : null;
}
