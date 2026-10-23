import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect } from "react";
import { Dimensions } from "react-native";
import { isPhoneScreen } from "@/src/lib/windowLayout";

/**
 * The app declares every orientation (app.json), which a tablet needs to turn
 * and, on iPad, to share the screen. A phone keeps the portrait the whole app
 * is designed for. Mounted once, at the root.
 */
export function usePhonePortraitLock(): void {
	useEffect(() => {
		if (!isPhoneScreen(Dimensions.get("screen"))) return;
		ScreenOrientation.lockAsync(
			ScreenOrientation.OrientationLock.PORTRAIT_UP,
		).catch(() => {
			// No orientation API (web, tests): nothing to lock.
		});
	}, []);
}
