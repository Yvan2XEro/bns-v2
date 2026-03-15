import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Returns true if the user has "Reduce Motion" enabled in system settings.
 * When true, skip or simplify animations.
 */
export function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false);

	useEffect(() => {
		AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
		const sub = AccessibilityInfo.addEventListener(
			"reduceMotionChanged",
			setReduced,
		);
		return () => sub.remove();
	}, []);

	return reduced;
}
