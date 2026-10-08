import type { RiderLinkView } from "../../../api/src/contracts/shipments";
import { ERROR_CODES } from "./apiError";

export type RiderAction = RiderLinkView["allowedActions"][number];

export interface RiderButton {
	action: RiderAction;
	/** A `Rider.*` message key. */
	labelKey: string;
	tone: "primary" | "danger" | "neutral";
}

/** Total over the union: a fifth action in the contract is a type error here. */
export const RIDER_BUTTONS: Record<RiderAction, RiderButton> = {
	picked_up: { action: "picked_up", labelKey: "pickedUp", tone: "primary" },
	attempt: { action: "attempt", labelKey: "failed", tone: "danger" },
	handover: { action: "handover", labelKey: "enterCode", tone: "primary" },
	photo: { action: "photo", labelKey: "addPhoto", tone: "neutral" },
};

const ORDER: readonly RiderAction[] = [
	"picked_up",
	"attempt",
	"handover",
	"photo",
];

/** The buttons the route's `allowedActions` allow, in the page's fixed order. */
export function riderButtons(allowed: readonly RiderAction[]): RiderButton[] {
	return ORDER.filter((action) => allowed.includes(action)).map(
		(action) => RIDER_BUTTONS[action],
	);
}

export type RiderScreen = "invalid" | "rateLimited" | "failed";

/**
 * A token the API does not know, has revoked, expired or finished all answer
 * the same 404; the page shows one generic screen for it and never says which.
 */
export function riderErrorScreen(error: unknown): RiderScreen {
	const status =
		error && typeof error === "object" && "status" in error
			? error.status
			: null;
	const code =
		error && typeof error === "object" && "code" in error ? error.code : null;
	if (status === 404 || code === ERROR_CODES.shipmentRiderLinkInvalid) {
		return "invalid";
	}
	if (status === 429 || code === ERROR_CODES.rateLimited) return "rateLimited";
	return "failed";
}

export interface GpsPoint {
	lat: number;
	lng: number;
}

export type ProofKind = "attempt" | "handover";

export interface StoredPhoto {
	id: string;
	kind: ProofKind;
}

/** A photo attached to the wrong kind of action would be hidden from (or shown to) the wrong audience. */
export function photoFor(
	kind: ProofKind,
	stored: StoredPhoto | null,
): string | undefined {
	return stored?.kind === kind ? stored.id : undefined;
}

export function pickedUpBody(gps: GpsPoint | null): { gps?: GpsPoint } {
	return gps ? { gps } : {};
}

export function attemptBody(input: {
	reason: string;
	note: string;
	gps: GpsPoint | null;
	photoId?: string;
}) {
	const note = input.note.trim();
	return {
		reason: input.reason,
		...(note ? { note } : {}),
		...(input.gps ? { gps: input.gps } : {}),
		...(input.photoId ? { photoId: input.photoId } : {}),
	};
}

export function handoverBody(input: {
	code: string;
	gps: GpsPoint | null;
	photoId?: string;
}) {
	return {
		code: input.code,
		...(input.gps ? { gps: input.gps } : {}),
		...(input.photoId ? { photoId: input.photoId } : {}),
	};
}

/**
 * One fix, asked for only when the rider presses an action. A refusal, a
 * timeout or a device without positioning all read as "no position": the
 * action goes ahead without it.
 */
export function capturePosition(
	geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined,
	timeoutMs = 8000,
): Promise<GpsPoint | null> {
	if (!geolocation) return Promise.resolve(null);
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(null), timeoutMs + 500);
		geolocation.getCurrentPosition(
			(position) => {
				clearTimeout(timer);
				resolve({
					lat: position.coords.latitude,
					lng: position.coords.longitude,
				});
			},
			() => {
				clearTimeout(timer);
				resolve(null);
			},
			{ enableHighAccuracy: true, timeout: timeoutMs },
		);
	});
}
