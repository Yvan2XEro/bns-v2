export interface Coordinates {
	lat: number;
	lng: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function radians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

export function haversineMeters(from: Coordinates, to: Coordinates): number {
	const latitudeDelta = radians(to.lat - from.lat);
	const longitudeDelta = radians(to.lng - from.lng);
	const fromLatitude = radians(from.lat);
	const toLatitude = radians(to.lat);
	const haversine =
		Math.sin(latitudeDelta / 2) ** 2 +
		Math.cos(fromLatitude) *
			Math.cos(toLatitude) *
			Math.sin(longitudeDelta / 2) ** 2;
	return Math.round(
		2 *
			EARTH_RADIUS_METERS *
			Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
	);
}

export const distanceMeters = haversineMeters;
