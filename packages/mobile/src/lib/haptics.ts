import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * The phone's buzz for an outcome, not a tap: something the user asked for
 * went through (added to cart, order accepted, code confirmed) or was
 * refused. Silent on the web build, and a device without a motor simply
 * ignores it — never a reason to fail the action.
 */
export function hapticOutcome(outcome: "success" | "error"): void {
	if (Platform.OS === "web") return;
	Haptics.notificationAsync(
		outcome === "success"
			? Haptics.NotificationFeedbackType.Success
			: Haptics.NotificationFeedbackType.Error,
	).catch(() => {});
}
