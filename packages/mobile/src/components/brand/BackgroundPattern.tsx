import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Path, Pattern, Rect } from "react-native-svg";

/**
 * The web's background patterns, carried over tile for tile
 * (see `.pattern-*` in packages/web/src/app/globals.css).
 *
 * React Native has no tiling background, so each one is an SVG <Pattern>.
 * The web makes them drift; here they hold still — DESIGN.md allows no
 * ambient loops, and a ground that moves behind text only competes with it.
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
	}
> = {
	// .pattern-grid — rgba(255,255,255,0.05)
	grid: {
		tile: { w: 60, h: 60 },
		color: "#ffffff",
		opacity: 0.05,
	},
	// .pattern-dots — rgba(30,64,175,0.06)
	dots: {
		tile: { w: 20, h: 20 },
		color: "#1e40af",
		opacity: 0.06,
	},
	// .pattern-dots-light — rgba(255,255,255,0.08)
	dotsLight: {
		tile: { w: 20, h: 20 },
		color: "#ffffff",
		opacity: 0.08,
	},
	// .pattern-cross — rgba(30,64,175,0.06)
	cross: {
		tile: { w: 40, h: 40 },
		color: "#1e40af",
		opacity: 0.06,
	},
	// .pattern-diagonal — rgba(255,255,255,0.04)
	diagonal: {
		tile: { w: 40, h: 40 },
		color: "#ffffff",
		opacity: 0.04,
	},
	// .pattern-hexagon — rgba(245,158,11,0.06)
	hexagon: {
		tile: { w: 50, h: 43.3 },
		color: "#f59e0b",
		opacity: 0.06,
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
}: {
	kind: PatternKind;
	/** Overrides the web's baked-in colour. */
	color?: string;
	/** Overrides the web's baked-in alpha. */
	opacity?: number;
}) {
	const spec = SPECS[kind];
	const stroke = color ?? spec.color;
	const alpha = opacity ?? spec.opacity;

	return (
		<View
			style={StyleSheet.absoluteFill}
			pointerEvents="none"
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
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
		</View>
	);
}

/**
 * The pairing the web uses on every dark header: fine light dots with a
 * diagonal rake over them (see the public pages' `pattern-dots-light
 * absolute inset-0` + `pattern-diagonal absolute inset-0`), held still.
 */
export function ShellPattern() {
	return (
		<>
			<BackgroundPattern kind="dotsLight" />
			<BackgroundPattern kind="diagonal" />
		</>
	);
}
