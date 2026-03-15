/**
 * Animated SVG primitives + animation hooks for illustrations.
 * All components created at module level (Reanimated requirement).
 */

import { useEffect } from "react";
import Animated, {
	Easing,
	useAnimatedProps,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";

// ─── Animated SVG primitives ─────────────────────────────────────────────────
export const ACircle = Animated.createAnimatedComponent(Circle);
export const APath = Animated.createAnimatedComponent(Path);
export const ARect = Animated.createAnimatedComponent(Rect);
export const AG = Animated.createAnimatedComponent(G);
export const ALine = Animated.createAnimatedComponent(Line);
export const AEllipse = Animated.createAnimatedComponent(Ellipse);

const ease = Easing.inOut(Easing.ease);
const sine = Easing.inOut(Easing.sin);

// ─── Opacity hooks ────────────────────────────────────────────────────────────

/** Pulsing opacity min↔max. Returns animatedProps { opacity }. */
export function usePulse(min: number, max: number, duration = 1800, delay = 0) {
	const reduced = useReducedMotion();
	const v = useSharedValue(min);
	useEffect(() => {
		if (reduced) {
			v.value = (min + max) / 2;
			return;
		}
		v.value = withDelay(
			delay,
			withRepeat(withTiming(max, { duration, easing: ease }), -1, true),
		);
	}, [reduced, delay, duration, max, min, v]);
	return useAnimatedProps(() => ({ opacity: v.value as number }));
}

/** Wave opacity: fade-in → fade-out sequence, repeating. */
export function useWaveOpacity(
	min: number,
	max: number,
	duration = 1200,
	delay = 0,
) {
	const reduced = useReducedMotion();
	const v = useSharedValue(min);
	useEffect(() => {
		if (reduced) {
			v.value = max;
			return;
		}
		v.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(max, { duration, easing: ease }),
					withTiming(min, { duration, easing: ease }),
				),
				-1,
			),
		);
	}, [reduced, delay, duration, max, min, v]);
	return useAnimatedProps(() => ({ opacity: v.value as number }));
}

// ─── Geometry hooks ───────────────────────────────────────────────────────────

/** Pulsing circle radius baseR↔maxR. Returns animatedProps { r }. */
export function usePulseR(
	baseR: number,
	maxR: number,
	duration = 2000,
	delay = 0,
) {
	const reduced = useReducedMotion();
	const v = useSharedValue(baseR);
	useEffect(() => {
		if (reduced) return;
		v.value = withDelay(
			delay,
			withRepeat(withTiming(maxR, { duration, easing: ease }), -1, true),
		);
	}, [reduced, delay, duration, maxR, v]);
	return useAnimatedProps(() => ({ r: v.value as number }));
}

/** Float a Circle on cy axis. Returns animatedProps { cy }. */
export function useFloatY(
	baseCy: number,
	distance: number,
	duration = 2500,
	delay = 0,
) {
	const reduced = useReducedMotion();
	const v = useSharedValue(baseCy);
	useEffect(() => {
		if (reduced) return;
		v.value = withDelay(
			delay,
			withRepeat(
				withTiming(baseCy - distance, { duration, easing: sine }),
				-1,
				true,
			),
		);
	}, [reduced, baseCy, delay, distance, duration, v]);
	return useAnimatedProps(() => ({ cy: v.value as number }));
}

// ─── Transform hooks (for AG / G groups) ─────────────────────────────────────

/** Float a G element on Y axis. Returns animatedProps { translateY }. */
export function useFloatG(distance: number, duration = 2500, delay = 0) {
	const reduced = useReducedMotion();
	const v = useSharedValue(0);
	useEffect(() => {
		if (reduced) return;
		v.value = withDelay(
			delay,
			withRepeat(withTiming(-distance, { duration, easing: sine }), -1, true),
		);
	}, [reduced, delay, distance, duration, v]);
	return useAnimatedProps(() => ({ translateY: v.value as number }));
}

/** Sweep a G element on X axis ±distance. Returns animatedProps { translateX }. */
export function useSweepX(distance: number, duration = 1800, delay = 0) {
	const reduced = useReducedMotion();
	const v = useSharedValue(0);
	useEffect(() => {
		if (reduced) return;
		v.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(distance, { duration, easing: ease }),
					withTiming(-distance, { duration, easing: ease }),
				),
				-1,
			),
		);
	}, [reduced, delay, distance, duration, v]);
	return useAnimatedProps(() => ({ translateX: v.value as number }));
}

/** Continuous rotation for a G element. Returns animatedProps { rotation }. */
export function useOrbit(duration = 5000, delay = 0, reverse = false) {
	const reduced = useReducedMotion();
	const v = useSharedValue(0);
	useEffect(() => {
		if (reduced) return;
		v.value = withDelay(
			delay,
			withRepeat(
				withTiming(reverse ? -360 : 360, { duration, easing: Easing.linear }),
				-1,
				false,
			),
		);
	}, [reduced, delay, duration, reverse, v]);
	return useAnimatedProps(() => ({ rotation: v.value as number }));
}

/** Scale pulse for a G element. Returns animatedProps { scale }. */
export function useScalePulse(
	min: number,
	max: number,
	duration = 1800,
	delay = 0,
) {
	const reduced = useReducedMotion();
	const v = useSharedValue(min);
	useEffect(() => {
		if (reduced) return;
		v.value = withDelay(
			delay,
			withRepeat(withTiming(max, { duration, easing: ease }), -1, true),
		);
	}, [reduced, delay, duration, max, v]);
	return useAnimatedProps(() => ({ scale: v.value as number }));
}

/** Wiggle rotation ±angle. Returns animatedProps { rotation }. */
export function useWiggle(angle = 8, duration = 900, delay = 0) {
	const reduced = useReducedMotion();
	const v = useSharedValue(0);
	useEffect(() => {
		if (reduced) return;
		v.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(angle, { duration: duration / 2, easing: ease }),
					withTiming(-angle, { duration, easing: ease }),
					withTiming(0, { duration: duration / 2, easing: ease }),
				),
				-1,
			),
		);
	}, [reduced, angle, delay, duration, v]);
	return useAnimatedProps(() => ({ rotation: v.value as number }));
}

/** Fire / light flicker effect. Returns animatedProps { opacity }. */
export function useFlicker(base: number, peak: number, delay = 0) {
	const reduced = useReducedMotion();
	const v = useSharedValue(base);
	useEffect(() => {
		if (reduced) {
			v.value = peak;
			return;
		}
		v.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(peak, { duration: 80 }),
					withTiming(base, { duration: 130 }),
					withTiming(peak * 0.85, { duration: 65 }),
					withTiming(base * 0.9, { duration: 110 }),
					withTiming(peak, { duration: 90 }),
					withTiming(base, { duration: 220 }),
				),
				-1,
			),
		);
	}, [reduced, base, delay, peak, v]);
	return useAnimatedProps(() => ({ opacity: v.value as number }));
}
