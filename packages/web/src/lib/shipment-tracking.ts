import type { BuyerShipmentView } from "../../../api/src/contracts/shipments";
import {
	DELIVERY_TIMEZONE,
	type DeliveryWindow,
	localDateAt,
	localParts,
	windowBounds,
} from "../../../api/src/lib/delivery/eta";
import type { OrderStatusName } from "./order-status";
import {
	FAILURE_REASON_LABELS,
	type FailureReason,
	type ShipmentStatus,
	shipmentStatusLabel,
} from "./shipment-status";

export { DELIVERY_TIMEZONE };

export type StepKey =
	| "prepared"
	| "picked_up"
	| "in_transit"
	| "ready"
	| "delivered";
export type StepState = "done" | "current" | "upcoming" | "stopped";

export interface TrackingStep {
	key: StepKey;
	state: StepState;
	at: string | null;
}

/**
 * Four steps for a delivered parcel, three for a pickup. `stopped` is where a
 * parcel that will not arrive left the road; the cell is explicit per status
 * so a status added server-side is a type error here, not a silent default.
 */
const DELIVERY_STATES: Record<ShipmentStatus, StepState[]> = {
	pending: ["current", "upcoming", "upcoming", "upcoming"],
	picked_up: ["done", "current", "upcoming", "upcoming"],
	in_transit: ["done", "done", "current", "upcoming"],
	delivered: ["done", "done", "done", "done"],
	failed: ["done", "done", "done", "stopped"],
	returned: ["done", "done", "done", "stopped"],
	cancelled: ["done", "stopped", "stopped", "stopped"],
};

const PICKUP_STATES: Record<ShipmentStatus, StepState[]> = {
	pending: ["done", "current", "upcoming"],
	picked_up: ["done", "done", "current"],
	in_transit: ["done", "done", "current"],
	delivered: ["done", "done", "done"],
	failed: ["done", "done", "stopped"],
	returned: ["done", "done", "stopped"],
	cancelled: ["done", "stopped", "stopped"],
};

export function trackingSteps(view: BuyerShipmentView): TrackingStep[] {
	const { stepper, status } = view;
	const delivered = status === "delivered" ? stepper.terminalAt : null;
	if (view.method === "pickup") {
		const states =
			status === "pending" && stepper.readyAt === null
				? (["current", "upcoming", "upcoming"] as StepState[])
				: PICKUP_STATES[status];
		const keys: StepKey[] = ["prepared", "ready", "delivered"];
		const dates = [null, stepper.readyAt, delivered];
		return keys.map((key, index) => ({
			key,
			state: states[index] ?? "upcoming",
			at: dates[index] ?? null,
		}));
	}
	const keys: StepKey[] = ["prepared", "picked_up", "in_transit", "delivered"];
	const dates = [null, stepper.pickedUpAt, stepper.inTransitAt, delivered];
	return keys.map((key, index) => ({
		key,
		state: DELIVERY_STATES[status][index] ?? "upcoming",
		at: dates[index] ?? null,
	}));
}

/** The `Delivery.*` key of the headline status, the pickup variant once it is ready. */
export function trackingHeadlineKey(view: BuyerShipmentView): string {
	return shipmentStatusLabel(
		"buyer",
		view.status,
		view.stepper.readyAt !== null,
	);
}

const RIDER_STATUSES: readonly ShipmentStatus[] = [
	"picked_up",
	"in_transit",
	"failed",
];

/** The API nulls `rider` outside the live window; the status check keeps a stale view honest too. */
export function riderCardVisible(view: BuyerShipmentView): boolean {
	return view.rider !== null && RIDER_STATUSES.includes(view.status);
}

export interface AttemptRow {
	number: number;
	at: string;
	labelKey: string;
}

const isFailureReason = (reason: string): reason is FailureReason =>
	reason in FAILURE_REASON_LABELS;

export function attemptRows(view: BuyerShipmentView): AttemptRow[] {
	return view.attempts.map((attempt) => ({
		number: attempt.number,
		at: attempt.at,
		labelKey:
			FAILURE_REASON_LABELS[
				isFailureReason(attempt.reason) ? attempt.reason : "other"
			],
	}));
}

export interface ProofCard {
	at: string;
	photoUrl: string | null;
	codeVerified: boolean;
	/** Whether the order's own action table offers `contest_delivery`; this module adds no rule. */
	contestable: boolean;
}

export function proofCard(
	view: BuyerShipmentView,
	contestAllowed: boolean,
): ProofCard | null {
	if (!view.proof) return null;
	return {
		at: view.proof.capturedAt,
		photoUrl: view.proof.photoUrl,
		codeVerified: view.proof.codeVerified,
		contestable: contestAllowed,
	};
}

export type CountdownUnit = "days" | "hours" | "minutes" | "expired";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Whole days from two days out, whole hours from one hour out, then minutes (never 0). */
export function countdownParts(
	deadline: string,
	now: Date,
): { unit: CountdownUnit; count: number } {
	const remaining = Date.parse(deadline) - now.getTime();
	if (!Number.isFinite(remaining) || remaining <= 0) {
		return { unit: "expired", count: 0 };
	}
	if (remaining >= 2 * DAY) {
		return { unit: "days", count: Math.floor(remaining / DAY) };
	}
	if (remaining >= HOUR) {
		return { unit: "hours", count: Math.floor(remaining / HOUR) };
	}
	return { unit: "minutes", count: Math.max(1, Math.ceil(remaining / 60_000)) };
}

export const RESCHEDULE_WINDOWS: readonly DeliveryWindow[] = [
	"morning",
	"afternoon",
	"evening",
];

export interface RescheduleDay {
	/** `YYYY-MM-DD` in the delivery timezone. */
	key: string;
	windows: Array<{ window: DeliveryWindow; iso: string }>;
}

/**
 * The next seven calendar days in the delivery timezone, each with the
 * windows whose start is still in the future and inside the server's
 * seven-day horizon. Which weekdays a zone delivers on is the server's call
 * (`shipment.rescheduleDateInvalid`); the client does not know the zone.
 */
export function rescheduleChoices(now: Date): RescheduleDay[] {
	const today = localParts(now);
	const horizon = now.getTime() + 7 * DAY;
	const days: RescheduleDay[] = [];
	for (let offset = 1; offset <= 7; offset += 1) {
		const base = new Date(
			Date.UTC(today.year, today.month - 1, today.day + offset),
		);
		const parts = {
			year: base.getUTCFullYear(),
			month: base.getUTCMonth() + 1,
			day: base.getUTCDate(),
		};
		const windows = RESCHEDULE_WINDOWS.flatMap((window) => {
			const start = localDateAt(parts, windowBounds(window).fromHour);
			return start.getTime() > now.getTime() && start.getTime() <= horizon
				? [{ window, iso: start.toISOString() }]
				: [];
		});
		if (windows.length === 0) continue;
		days.push({
			key: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
			windows,
		});
	}
	return days;
}

/** A server instant shown as a date in the delivery timezone, whatever the browser's zone. */
export function formatDeliveryDate(
	iso: string,
	locale: "fr" | "en",
	withTime = false,
): string {
	return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
		timeZone: DELIVERY_TIMEZONE,
		weekday: "long",
		day: "numeric",
		month: "long",
		...(withTime
			? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
			: {}),
	}).format(new Date(iso));
}

const PRE_SHIPMENT: readonly OrderStatusName[] = [
	"placed",
	"confirmed",
	"paid",
	"cancelled",
];

/** A shipment is created when the shop accepts, so none exists before that or after a cancellation. */
export function shipmentsExist(status: OrderStatusName): boolean {
	return !PRE_SHIPMENT.includes(status);
}
