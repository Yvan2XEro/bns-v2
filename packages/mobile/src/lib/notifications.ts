import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { PUSH_CHANNELS } from "../../../api/src/contracts/pushChannels";
import { api } from "./api";
import i18n from "./i18n";

Notifications.setNotificationHandler({
	handleNotification: async () => ({
		// SDK 57 replaced `shouldShowAlert` with the banner/list pair; without
		// these, foreground notifications silently never display.
		shouldShowBanner: true,
		shouldShowList: true,
		shouldPlaySound: true,
		shouldSetBadge: true,
	}),
});

/**
 * Sets the channels up and returns the push token. With `ask: false` the
 * system prompt is never shown: the token is only read when the permission
 * was already given, so signing in no longer opens with a cold "allow
 * notifications?" before the user has any reason to say yes.
 */
export async function registerForPushNotificationsAsync({
	ask = true,
}: {
	ask?: boolean;
} = {}): Promise<string | null> {
	// Everything here runs on a cold-start path; an unhandled rejection from any
	// of these native calls would surface as an app-level crash.
	try {
		if (Platform.OS === "android") {
			await Notifications.setNotificationChannelAsync(PUSH_CHANNELS.default, {
				name: i18n.t("notifications.channelDefault"),
				importance: Notifications.AndroidImportance.MAX,
				vibrationPattern: [0, 250, 250, 250],
				lightColor: "#1e40af",
			});
			// Its own channel, so a seller can give new orders a distinct sound
			// in Android's settings without hearing it for every message.
			await Notifications.setNotificationChannelAsync(PUSH_CHANNELS.orders, {
				name: i18n.t("notifications.channelOrders"),
				importance: Notifications.AndroidImportance.MAX,
				sound: "default",
				vibrationPattern: [0, 400, 200, 400, 200, 400],
				lightColor: "#F59E0B",
				lockscreenVisibility:
					Notifications.AndroidNotificationVisibility.PUBLIC,
			});
		}

		const { status: existingStatus } =
			await Notifications.getPermissionsAsync();
		let finalStatus = existingStatus;

		if (existingStatus !== "granted" && ask) {
			const { status } = await Notifications.requestPermissionsAsync();
			finalStatus = status;
		}

		if (finalStatus !== "granted") {
			return null;
		}
	} catch (error) {
		console.warn("[notifications] permission setup failed:", error);
		return null;
	}

	try {
		const projectId =
			Constants.expoConfig?.extra?.eas?.projectId ??
			Constants.easConfig?.projectId;
		const tokenData = await Notifications.getExpoPushTokenAsync(
			projectId ? { projectId } : undefined,
		);
		return tokenData.data;
	} catch {
		return null;
	}
}

export async function syncPushTokenWithBackend(
	pushToken: string,
): Promise<void> {
	try {
		await api.post("/api/public/novu/register-token", { token: pushToken });
	} catch (error) {
		console.warn("[notifications] Failed to sync push token:", error);
	}
}

const ASKED_KEY = "bns.pushAsked";

/**
 * Asks for push permission at the moment it obviously helps — a first
 * message sent, a first order placed — once per install, and syncs the token.
 */
export async function askForPushInContext(): Promise<void> {
	try {
		if (await AsyncStorage.getItem(ASKED_KEY)) return;
		await AsyncStorage.setItem(ASKED_KEY, "1");
		const token = await registerForPushNotificationsAsync({ ask: true });
		if (token) await syncPushTokenWithBackend(token);
	} catch {
		// The prompt is a nicety: nothing depends on it succeeding.
	}
}
