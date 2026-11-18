import { Easing, FadeIn, FadeInRight, FadeOut } from "react-native-reanimated";

/** One curve for every pane, Material's "emphasized decelerate". */
const DECELERATE = Easing.bezier(0.05, 0.7, 0.1, 1);

/**
 * How panes move, shared by every split so they all feel alike. Reanimated
 * skips them when the system asks for reduced motion.
 */
export const paneMotion = {
	/** A pane appearing with its split (a rotation, a tab opened). */
	appear: FadeIn.duration(220).easing(DECELERATE),
	/** The next item coming into the detail pane. */
	enter: FadeInRight.duration(280).easing(DECELERATE),
	/** The item it replaces, fading under it. */
	exit: FadeOut.duration(160),
};
