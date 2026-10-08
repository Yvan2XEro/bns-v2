import type { BuyerShipmentView } from "../../../api/src/contracts/shipments";
import { shipmentStatusLabel } from "./shipmentStatus";

export type StepState = "done" | "current" | "upcoming";

export interface TrackingStep {
	/** A `delivery.statusBuyer.*` / `delivery.pendingReadyBuyer` key. */
	labelKey: string;
	state: StepState;
	at: string | null;
}

type Status = BuyerShipmentView["status"];

const ORDER: readonly Status[] = [
	"pending",
	"picked_up",
	"in_transit",
	"delivered",
];

/**
 * The buyer's stepper. A parcel that failed, came back or was cancelled has no
 * current step: the steps it did reach stay done and the outcome is the status
 * label the block shows beside them. A pickup parcel has no rider legs, so its
 * stepper is "being prepared / ready" then "collected".
 */
export function trackingSteps(view: BuyerShipmentView): TrackingStep[] {
	const { stepper } = view;
	const active = ORDER.indexOf(view.status);
	const pickup = view.method === "pickup";
	const readyAt = stepper.readyAt;
	const stamp: Record<Status, string | null> = {
		pending: readyAt,
		picked_up: stepper.pickedUpAt,
		in_transit: stepper.inTransitAt,
		delivered: view.status === "delivered" ? stepper.terminalAt : null,
		failed: null,
		returned: null,
		cancelled: null,
	};
	const stateOf = (status: Status): StepState => {
		const index = ORDER.indexOf(status);
		if (active === -1)
			return ORDER.slice(index).some((later) => stamp[later])
				? "done"
				: "upcoming";
		if (view.status === "delivered") return "done";
		if (index < active) return "done";
		return index === active ? "current" : "upcoming";
	};
	const statuses: Status[] = pickup
		? ["pending", "delivered"]
		: ["pending", "picked_up", "in_transit", "delivered"];
	return statuses.map((status) => ({
		labelKey:
			status === "pending"
				? shipmentStatusLabel("buyer", "pending", readyAt !== null && pickup)
				: shipmentStatusLabel("buyer", status),
		state: stateOf(status),
		at: stamp[status],
	}));
}

/** The server computes `canReschedule`; the clock only closes a window that lapsed on screen. */
export function rescheduleAllowed(view: BuyerShipmentView, now: Date): boolean {
	if (!view.canReschedule) return false;
	return view.redelivery
		? Date.parse(view.redelivery.rescheduleBy) > now.getTime()
		: true;
}

export function showRiderCard(view: BuyerShipmentView): boolean {
	return (
		view.rider !== null &&
		(view.status === "picked_up" ||
			view.status === "in_transit" ||
			view.status === "failed")
	);
}

export function telHref(phone: string): string {
	return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export type PickupCountdown =
	| { kind: "none" }
	| { kind: "expired" }
	| { kind: "days" | "hours" | "minutes"; count: number };

/** Whole days while more than two remain, then hours, then minutes; never negative. */
export function pickupCountdown(
	deadline: string | null,
	now: Date,
): PickupCountdown {
	if (!deadline) return { kind: "none" };
	const remaining = Date.parse(deadline) - now.getTime();
	if (Number.isNaN(remaining)) return { kind: "none" };
	if (remaining <= 0) return { kind: "expired" };
	const hours = remaining / 3_600_000;
	if (hours >= 48) return { kind: "days", count: Math.floor(hours / 24) };
	if (hours >= 1) return { kind: "hours", count: Math.floor(hours) };
	return { kind: "minutes", count: Math.max(1, Math.ceil(remaining / 60_000)) };
}

const DOUALA_OFFSET_MS = 3_600_000;
const SLOT_UTC_HOUR = 11;

export interface RescheduleDay {
	/** What the reschedule route receives: 12:00 in Douala, as a UTC instant. */
	iso: string;
}

/**
 * The next calendar days a buyer may pick from. Which of them is a delivery
 * day belongs to the zone: the server refuses the rest with
 * `shipment.rescheduleDateInvalid` and the screen shows that message.
 */
export function rescheduleDays(now: Date, count = 7): RescheduleDay[] {
	const local = new Date(now.getTime() + DOUALA_OFFSET_MS);
	const horizon = now.getTime() + 7 * 86_400_000;
	return Array.from({ length: count }, (_, i) => i + 1)
		.map((offset) =>
			Date.UTC(
				local.getUTCFullYear(),
				local.getUTCMonth(),
				local.getUTCDate() + offset,
				SLOT_UTC_HOUR,
			),
		)
		.filter((time) => time > now.getTime() && time <= horizon)
		.map((time) => ({ iso: new Date(time).toISOString() }));
}
