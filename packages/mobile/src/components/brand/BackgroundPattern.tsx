import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	cancelAnimation,
	Easing,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Path, Pattern, Rect } from "react-native-svg";

/**
 * The web's background patterns, carried over tile for tile
 * (see `.pattern-*` in packages/web/src/app/globals.css).
 *
 * The web paints these as a repeating background-image and slides the
 * background-position to make them drift. React Native has no tiling
 * background, so each one is an SVG <Pattern> instead, and the drift is a
 * translate on an oversized layer — same motion, same period.
 *
 * Purely decorative: it sits under the content and never takes touches or
 * the screen reader.
 */

type PatternKind =
	| "grid"
	| "dots"
	| "dotsLight"
	| "cross"
	| "diagonal"
	| "hexagon";

/**
 * Tile size, stroke/fill colour and opacity per pattern, read off the web's
 * base64 SVGs. The web bakes the alpha into the `rgba()` fill; here it rides
 * on the <Rect> so the colour stays overridable.
 */
const SPECS: Record<
	PatternKind,
	{
		tile: { w: number; h: number };
		color: string;
		opacity: number;
		/** Drift period in ms and the distance travelled, from @keyframes. */
		drift: { ms: number; x: number; y: number };
	}
> = {
	// .pattern-grid — rgba(255,255,255,0.05), patternDrift 25s → 60px 60px
	grid: {
		tile: { w: 60, h: 60 },
		color: "#ffffff",
		opacity: 0.05,
		drift: { ms: 25000, x: 60, y: 60 },
	},
	// .pattern-dots — rgba(30,64,175,0.06), patternDriftSlow 20s → 40px 40px
	dots: {
		tile: { w: 20, h: 20 },
		color: "#1e40af",
		opacity: 0.06,
		drift: { ms: 20000, x: 40, y: 40 },
	},
	// .pattern-dots-light — rgba(255,255,255,0.08), patternDriftSlow 18s
	dotsLight: {
		tile: { w: 20, h: 20 },
		color: "#ffffff",
		opacity: 0.08,
		drift: { ms: 18000, x: 40, y: 40 },
	},
	// .pattern-cross — rgba(30,64,175,0.06), patternDriftSlow 30s
	cross: {
		tile: { w: 40, h: 40 },
		color: "#1e40af",
		opacity: 0.06,
		drift: { ms: 30000, x: 40, y: 40 },
	},
	// .pattern-diagonal — rgba(255,255,255,0.04), patternDriftDiag 22s → 80px -80px
	diagonal: {
		tile: { w: 40, h: 40 },
		color: "#ffffff",
		opacity: 0.04,
		drift: { ms: 22000, x: 80, y: -80 },
	},
	// .pattern-hexagon — rgba(245,158,11,0.06), patternDrift 35s → 60px 60px
	hexagon: {
		tile: { w: 50, h: 43.3 },
		color: "#f59e0b",
		opacity: 0.06,
		drift: { ms: 35000, x: 60, y: 60 },
	},
};

/** The tile body for each pattern, matching the web's SVG path data. */
function Tile({ kind, color }: { kind: PatternKind; color: string }) {
	switch (kind) {
		case "grid":
			// M 60 0 L 0 0 0 60 — the top and left edge of each cell
			return (
				<Path
					d="M 60 0 L 0 0 0 60"
					fill="none"
					stroke={color}
					strokeWidth={1}
				/>
			);
		case "dots":
		case "dotsLight":
			return <Circle cx={10} cy={10} r={1.2} fill={color} />;
		case "cross":
			return (
				<Path
					d="M20 16v8M16 20h8"
					stroke={color}
					strokeWidth={1.5}
					fill="none"
					strokeLinecap="round"
				/>
			);
		case "diagonal":
			return <Path d="M0 40L40 0" stroke={color} strokeWidth={1} fill="none" />;
		case "hexagon":
			return (
				<Path
					d="M25 2L37.5 10.8V28.4L25 37.2L12.5 28.4V10.8Z"
					stroke={color}
					strokeWidth={1}
					fill="none"
				/>
			);
	}
}

export function BackgroundPattern({
	kind,
	color,
	opacity,
	animated = true,
}: {
	kind: PatternKind;
	/** Overrides the web's baked-in colour. */
	color?: string;
	/** Overrides the web's baked-in alpha. */
	opacity?: number;
	animated?: boolean;
}) {
	const spec = SPECS[kind];
	const stroke = color ?? spec.color;
	const alpha = opacity ?? spec.opacity;

	const progress = useSharedValue(0);
	// Honour the OS "reduce motion" switch — a drifting ground is exactly the
	// kind of ambient motion that setting exists to stop.
	const reducedMotion = useReducedMotion();
	const moving = animated && !reducedMotion;

	useEffect(() => {
		if (!moving) {
			progress.value = 0;
			return;
		}
		progress.value = withRepeat(
			withTiming(1, { duration: spec.drift.ms, easing: Easing.linear }),
			-1,
			false,
		);
		return () => cancelAnimation(progress);
	}, [moving, progress, spec.drift.ms]);

	const driftStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: progress.value * spec.drift.x },
			{ translateY: progress.value * spec.drift.y },
		],
	}));

	// The layer is grown by the drift distance on each axis (and offset by the
	// same) so the translate never exposes an unpainted edge.
	const padX = Math.abs(spec.drift.x);
	const padY = Math.abs(spec.drift.y);

	return (
		<View
			style={StyleSheet.absoluteFill}
			pointerEvents="none"
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<Animated.View
				style={[
					{
						position: "absolute",
						left: -padX,
						top: -padY,
						right: -padX,
						bottom: -padY,
					},
					driftStyle,
				]}
			>
				<Svg width="100%" height="100%">
					<Defs>
						<Pattern
							id={`bg-${kind}`}
							width={spec.tile.w}
							height={spec.tile.h}
							patternUnits="userSpaceOnUse"
						>
							<Tile kind={kind} color={stroke} />
						</Pattern>
					</Defs>
					<Rect
						width="100%"
						height="100%"
						fill={`url(#bg-${kind})`}
						opacity={alpha}
					/>
				</Svg>
			</Animated.View>
		</View>
	);
}

/**
 * The pairing the web uses on every dark header: fine light dots with a
 * slower diagonal rake over them (see the public pages' `pattern-dots-light
 * absolute inset-0` + `pattern-diagonal absolute inset-0`).
 */
export function ShellPattern({ animated = true }: { animated?: boolean }) {
	return (
		<>
			<BackgroundPattern kind="dotsLight" animated={animated} />
			<BackgroundPattern kind="diagonal" animated={animated} />
		</>
	);
}
