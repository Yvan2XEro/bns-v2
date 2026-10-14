import { type Place, reversePlace } from "../../../api/src/contracts/places";

export type DeviceLocationFailure =
	| "unsupported"
	| "permission-denied"
	| "position-unavailable"
	| "geocode-unavailable";

export class DeviceLocationError extends Error {
	constructor(readonly failure: DeviceLocationFailure) {
		super(failure);
	}
}

function currentPosition(): Promise<GeolocationPosition> {
	return new Promise((resolve, reject) => {
		if (typeof navigator === "undefined" || !navigator.geolocation) {
			reject(new DeviceLocationError("unsupported"));
			return;
		}
		navigator.geolocation.getCurrentPosition(
			resolve,
			(error) =>
				reject(
					new DeviceLocationError(
						error.code === error.PERMISSION_DENIED
							? "permission-denied"
							: "position-unavailable",
					),
				),
			{ enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
		);
	});
}

/**
 * The browser's position, named by Photon. Only call it from a click: it may
 * show the browser's permission prompt. Rejects with a `DeviceLocationError`
 * whose `failure` the picker turns into a message.
 */
export async function locateDevice(
	photonUrl: string | null,
	lang: string,
): Promise<Place> {
	const position = await currentPosition();
	const coords = {
		lat: position.coords.latitude,
		lng: position.coords.longitude,
	};
	const place = await reversePlace(photonUrl, coords, lang);
	if (!place) throw new DeviceLocationError("geocode-unavailable");
	return place;
}
