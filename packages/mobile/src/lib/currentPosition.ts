import * as Location from "expo-location";

/** A fix for an action's audit trail. A refused permission or a failed fix is `null`, never an error. */
export async function tryCurrentGps(): Promise<{
	lat: number;
	lng: number;
} | null> {
	try {
		const { status } = await Location.requestForegroundPermissionsAsync();
		if (status !== "granted") return null;
		const { coords } = await Location.getCurrentPositionAsync({
			accuracy: Location.Accuracy.High,
		});
		return { lat: coords.latitude, lng: coords.longitude };
	} catch {
		return null;
	}
}
