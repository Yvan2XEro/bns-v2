import { Platform } from "react-native";
import { feedback } from "./feedback";

/**
 * The phone's buzz — and, for a success, a balafon strike — for an outcome,
 * not a tap: something the user asked for went through (added to cart, order
 * accepted, code confirmed) or was refused. Silent on the web build, and a
 * device without a motor or speaker simply ignores it — never a reason to
 * fail the action.
 */
export function hapticOutcome(outcome: "success" | "error"): void {
	if (Platform.OS === "web") return;
	// A success is worth the balafon; a refusal only buzzes, because the error
	// sheet that follows it already sounds.
	if (outcome === "success") feedback("success");
	else feedback("error", { sound: false });
}
