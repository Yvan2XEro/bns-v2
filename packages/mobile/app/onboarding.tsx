import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
	Dimensions,
	FlatList,
	Pressable,
	StyleSheet,
	Text,
	View,
	type ViewToken,
} from "react-native";
import Animated, {
	Easing,
	useAnimatedProps,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
	Circle,
	Ellipse,
	G,
	Line,
	Path,
	Polygon,
	Rect,
} from "react-native-svg";
import { Colors, Fonts, shadows } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const { width: SW } = Dimensions.get("window");

// ─── Animated SVG primitives ──────────────────────────────────────────────────
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const _AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const _AnimatedLine = Animated.createAnimatedComponent(Line);

// ─── Palette ──────────────────────────────────────────────────────────────────
const P = {
	blueDark: "#1e3a8a",
	blue: "#1e40af",
	blueMid: "#3b82f6",
	blueLight: "#93c5fd",
	bluePale: "#dbeafe",
	yellowDark: "#b45309",
	yellow: "#d97706",
	yellowMid: "#f59e0b",
	yellowLight: "#fbbf24",
	yellowPale: "#fef3c7",
	amber: "#f59e0b",
	amberLight: "#fde68a",
	white: "#ffffff",
	dark: "#0f172a",
};

// ─── Slide data ───────────────────────────────────────────────────────────────
const SLIDES = [
	{
		id: "welcome",
		bgLight: "#eff6ff",
		bgDark: "#1a2540",
		title: "Bienvenue sur\nBuy'N'Sellem",
		description:
			"La marketplace simple pour acheter et vendre près de chez vous.",
	},
	{
		id: "browse",
		bgLight: "#f0f9ff",
		bgDark: "#0c2233",
		title: "Des milliers\nd'annonces",
		description:
			"Trouvez les meilleures offres dans votre région en quelques secondes.",
	},
	{
		id: "sell",
		bgLight: "#fff7ed",
		bgDark: "#261508",
		title: "Vendez\nen quelques clics",
		description:
			"Publiez votre annonce en moins de 2 minutes et touchez des milliers d'acheteurs.",
	},
	{
		id: "chat",
		bgLight: "#f0fdf4",
		bgDark: "#0a2015",
		title: "Échangez\nen toute sécurité",
		description:
			"Discutez directement avec acheteurs et vendeurs en toute confiance.",
	},
];

// ─── Illustration 1 — Storefront ──────────────────────────────────────────────
function IllustrationStore() {
	const signY = useSharedValue(0);
	const starOp1 = useSharedValue(1);
	const starOp2 = useSharedValue(0.4);
	const starOp3 = useSharedValue(0.7);
	const doorScaleX = useSharedValue(1);
	const winOp = useSharedValue(0.5);

	useEffect(() => {
		signY.value = withRepeat(
			withSequence(
				withTiming(-9, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
				withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
			),
			-1,
		);
		starOp1.value = withRepeat(
			withSequence(
				withTiming(0.15, { duration: 750 }),
				withTiming(1, { duration: 750 }),
			),
			-1,
		);
		starOp2.value = withDelay(
			300,
			withRepeat(
				withSequence(
					withTiming(1, { duration: 550 }),
					withTiming(0.2, { duration: 850 }),
				),
				-1,
			),
		);
		starOp3.value = withDelay(
			600,
			withRepeat(
				withSequence(
					withTiming(0.1, { duration: 1000 }),
					withTiming(0.9, { duration: 700 }),
				),
				-1,
			),
		);
		doorScaleX.value = withDelay(
			500,
			withRepeat(
				withSequence(
					withTiming(0.82, {
						duration: 1600,
						easing: Easing.inOut(Easing.ease),
					}),
					withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
				),
				-1,
			),
		);
		winOp.value = withRepeat(
			withSequence(
				withTiming(1, { duration: 2200 }),
				withTiming(0.4, { duration: 2200 }),
			),
			-1,
		);
	}, [doorScaleX, signY, starOp1, starOp2, starOp3, winOp]);

	const signProps = useAnimatedProps(() => ({ translateY: signY.value }));
	const star1Props = useAnimatedProps(() => ({ opacity: starOp1.value }));
	const star2Props = useAnimatedProps(() => ({ opacity: starOp2.value }));
	const star3Props = useAnimatedProps(() => ({ opacity: starOp3.value }));
	const doorProps = useAnimatedProps(() => ({
		scaleX: doorScaleX.value,
		origin: "88, 185",
	}));
	const winProps = useAnimatedProps(() => ({ opacity: winOp.value }));

	return (
		<Svg width={220} height={220} viewBox="0 0 220 220">
			{/* Ground shadow */}
			<Ellipse
				cx="110"
				cy="216"
				rx="90"
				ry="8"
				fill={P.blueDark}
				opacity={0.12}
			/>

			{/* Building body */}
			<Rect
				x="28"
				y="94"
				width="164"
				height="118"
				rx="4"
				fill={P.bluePale}
				stroke={P.blue}
				strokeWidth="2.5"
			/>

			{/* Gable / roof */}
			<Polygon points="20,96 110,45 200,96" fill={P.blue} />
			{/* Roof ridge */}
			<Rect x="98" y="41" width="24" height="9" rx="4.5" fill={P.blueDark} />

			{/* Awning */}
			<Path
				d="M26,103 Q55,122 84,103 Q113,122 142,103 Q171,122 196,103 L196,96 L26,96 Z"
				fill={P.yellow}
			/>
			{/* Awning white stripes */}
			{[50, 104, 158].map((cx, i) => (
				<Path
					key={i}
					d={`M${cx - 9},96 Q${cx},113 ${cx + 9},96 Z`}
					fill="rgba(255,255,255,0.3)"
				/>
			))}

			{/* Left window glow */}
			<AnimatedRect
				animatedProps={winProps}
				x="40"
				y="110"
				width="56"
				height="48"
				rx="5"
				fill={P.blueLight}
				stroke={P.blue}
				strokeWidth="1.5"
			/>
			<Line
				x1="68"
				y1="110"
				x2="68"
				y2="158"
				stroke={P.blue}
				strokeWidth="1.5"
			/>
			<Line
				x1="40"
				y1="134"
				x2="96"
				y2="134"
				stroke={P.blue}
				strokeWidth="1.5"
			/>
			<Rect x="36" y="158" width="64" height="5" rx="2.5" fill={P.blue} />

			{/* Right window glow */}
			<AnimatedRect
				animatedProps={winProps}
				x="124"
				y="110"
				width="56"
				height="48"
				rx="5"
				fill={P.blueLight}
				stroke={P.blue}
				strokeWidth="1.5"
			/>
			<Line
				x1="152"
				y1="110"
				x2="152"
				y2="158"
				stroke={P.blue}
				strokeWidth="1.5"
			/>
			<Line
				x1="124"
				y1="134"
				x2="180"
				y2="134"
				stroke={P.blue}
				strokeWidth="1.5"
			/>
			<Rect x="120" y="158" width="64" height="5" rx="2.5" fill={P.blue} />

			{/* Door arch */}
			<Path d="M86,212 L86,162 A24,24 0 0 1 134,162 L134,212 Z" fill={P.blue} />
			<Path
				d="M84,212 L84,162 A26,26 0 0 1 136,162 L136,212"
				fill="none"
				stroke={P.blueDark}
				strokeWidth="2"
			/>
			{/* Left door panel (animated open) */}
			<AnimatedG animatedProps={doorProps}>
				<Rect
					x="88"
					y="167"
					width="16"
					height="19"
					rx="2"
					fill={P.blueDark}
					opacity={0.45}
				/>
				<Rect
					x="88"
					y="190"
					width="16"
					height="17"
					rx="2"
					fill={P.blueDark}
					opacity={0.45}
				/>
			</AnimatedG>
			{/* Right door panel */}
			<Rect
				x="116"
				y="167"
				width="16"
				height="19"
				rx="2"
				fill={P.blueDark}
				opacity={0.45}
			/>
			<Rect
				x="116"
				y="190"
				width="16"
				height="17"
				rx="2"
				fill={P.blueDark}
				opacity={0.45}
			/>
			{/* Doorknob */}
			<Circle cx="115" cy="190" r="3.5" fill={P.amber} />
			{/* Doorstep */}
			<Rect
				x="74"
				y="210"
				width="72"
				height="7"
				rx="3"
				fill={P.blue}
				opacity={0.4}
			/>

			{/* Shop sign (bobbing) */}
			<AnimatedG animatedProps={signProps}>
				<Line
					x1="110"
					y1="45"
					x2="110"
					y2="54"
					stroke={P.blueDark}
					strokeWidth="2"
				/>
				<Rect
					x="66"
					y="54"
					width="88"
					height="36"
					rx="11"
					fill={P.amber}
					stroke={P.yellowDark}
					strokeWidth="2"
				/>
				{/* Sign text blocks */}
				<Rect
					x="76"
					y="63"
					width="28"
					height="6"
					rx="3"
					fill={P.white}
					opacity={0.9}
				/>
				<Circle cx="112" cy="66" r="4" fill={P.yellowDark} />
				<Rect
					x="120"
					y="63"
					width="6"
					height="6"
					rx="3"
					fill={P.white}
					opacity={0.9}
				/>
				<Rect
					x="76"
					y="75"
					width="50"
					height="6"
					rx="3"
					fill={P.white}
					opacity={0.65}
				/>
			</AnimatedG>

			{/* Stars */}
			<AnimatedPath
				animatedProps={star1Props}
				d="M18,36 L20,43 L27,43 L22,47 L24,54 L18,50 L12,54 L14,47 L9,43 L16,43 Z"
				fill={P.amber}
			/>
			<AnimatedPath
				animatedProps={star2Props}
				d="M196,26 L197.5,32 L204,32 L199,36 L201,42 L196,38 L191,42 L193,36 L188,32 L194.5,32 Z"
				fill={P.amber}
			/>
			<AnimatedCircle
				animatedProps={star3Props}
				cx="34"
				cy="72"
				r="4.5"
				fill={P.blueLight}
			/>
			<AnimatedCircle
				animatedProps={star1Props}
				cx="188"
				cy="74"
				r="3.5"
				fill={P.yellowLight}
			/>
		</Svg>
	);
}

// ─── Illustration 2 — Phone + Search ─────────────────────────────────────────
function IllustrationSearch() {
	const card1Y = useSharedValue(35);
	const card1Op = useSharedValue(0);
	const card2Y = useSharedValue(35);
	const card2Op = useSharedValue(0);
	const card3Y = useSharedValue(35);
	const card3Op = useSharedValue(0);
	const loupeX = useSharedValue(0);
	const pinY = useSharedValue(0);
	const sparkOp = useSharedValue(1);

	useEffect(() => {
		// Cards slide up
		card1Y.value = withTiming(0, { duration: 480 });
		card1Op.value = withTiming(1, { duration: 380 });
		card2Y.value = withDelay(200, withTiming(0, { duration: 480 }));
		card2Op.value = withDelay(200, withTiming(1, { duration: 380 }));
		card3Y.value = withDelay(400, withTiming(0, { duration: 480 }));
		card3Op.value = withDelay(400, withTiming(1, { duration: 380 }));

		// Magnifying glass sweeps
		loupeX.value = withDelay(
			900,
			withRepeat(
				withSequence(
					withTiming(22, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
					withTiming(-22, {
						duration: 1400,
						easing: Easing.inOut(Easing.ease),
					}),
				),
				-1,
			),
		);

		// Pin bounces
		pinY.value = withRepeat(
			withSequence(
				withTiming(-10, { duration: 380, easing: Easing.out(Easing.back(2)) }),
				withTiming(0, { duration: 380, easing: Easing.in(Easing.ease) }),
				withTiming(0, { duration: 400 }),
			),
			-1,
		);

		// Sparkles twinkle
		sparkOp.value = withRepeat(
			withSequence(
				withTiming(0.15, { duration: 650 }),
				withTiming(1, { duration: 650 }),
			),
			-1,
		);
	}, [
		card1Op, // Cards slide up
		card1Y,
		card2Op,
		card2Y,
		card3Op,
		card3Y, // Magnifying glass sweeps
		loupeX, // Pin bounces
		pinY, // Sparkles twinkle
		sparkOp,
	]);

	const c1Props = useAnimatedProps(() => ({
		translateY: card1Y.value,
		opacity: card1Op.value,
	}));
	const c2Props = useAnimatedProps(() => ({
		translateY: card2Y.value,
		opacity: card2Op.value,
	}));
	const c3Props = useAnimatedProps(() => ({
		translateY: card3Y.value,
		opacity: card3Op.value,
	}));
	const loupeProps = useAnimatedProps(() => ({ translateX: loupeX.value }));
	const pinProps = useAnimatedProps(() => ({ translateY: pinY.value }));
	const sparkProps = useAnimatedProps(() => ({ opacity: sparkOp.value }));

	return (
		<Svg width={220} height={220} viewBox="0 0 220 220">
			{/* Phone shadow */}
			<Ellipse
				cx="110"
				cy="216"
				rx="52"
				ry="6"
				fill={P.blueDark}
				opacity={0.14}
			/>

			{/* Phone body */}
			<Rect
				x="50"
				y="10"
				width="120"
				height="202"
				rx="20"
				fill={P.blue}
				stroke={P.blueDark}
				strokeWidth="2.5"
			/>
			<Rect x="54" y="14" width="112" height="194" rx="17" fill={P.blueMid} />
			{/* Screen */}
			<Rect x="58" y="26" width="104" height="172" rx="11" fill="#f8fafc" />
			{/* Notch */}
			<Rect x="87" y="22" width="46" height="7" rx="3.5" fill={P.blueDark} />
			{/* Home bar */}
			<Rect
				x="94"
				y="205"
				width="32"
				height="3.5"
				rx="2"
				fill={P.blueLight}
				opacity={0.5}
			/>

			{/* Card 1 — Orange listing */}
			<AnimatedG animatedProps={c1Props}>
				<Rect
					x="65"
					y="34"
					width="90"
					height="46"
					rx="8"
					fill={P.yellowPale}
					stroke={P.yellowLight}
					strokeWidth="1"
				/>
				<Rect
					x="70"
					y="39"
					width="30"
					height="36"
					rx="6"
					fill={P.yellowLight}
				/>
				<Circle cx="85" cy="55" r="8" fill={P.yellow} opacity={0.55} />
				<Rect x="107" y="42" width="42" height="5.5" rx="2.5" fill={P.yellow} />
				<Rect
					x="107"
					y="52"
					width="32"
					height="4.5"
					rx="2"
					fill={P.yellowLight}
				/>
				<Rect x="107" y="61" width="24" height="6" rx="3" fill={P.amber} />
			</AnimatedG>

			{/* Card 2 — Blue listing */}
			<AnimatedG animatedProps={c2Props}>
				<Rect
					x="65"
					y="86"
					width="90"
					height="46"
					rx="8"
					fill={P.bluePale}
					stroke={P.blueLight}
					strokeWidth="1"
				/>
				<Rect x="70" y="91" width="30" height="36" rx="6" fill={P.blueLight} />
				<Circle cx="85" cy="107" r="8" fill={P.blueMid} opacity={0.55} />
				<Rect x="107" y="94" width="42" height="5.5" rx="2.5" fill={P.blue} />
				<Rect
					x="107"
					y="104"
					width="32"
					height="4.5"
					rx="2"
					fill={P.blueLight}
				/>
				<Rect x="107" y="113" width="24" height="6" rx="3" fill={P.amber} />
			</AnimatedG>

			{/* Card 3 — Amber listing */}
			<AnimatedG animatedProps={c3Props}>
				<Rect
					x="65"
					y="138"
					width="90"
					height="46"
					rx="8"
					fill="#fffbeb"
					stroke="#fde68a"
					strokeWidth="1"
				/>
				<Rect
					x="70"
					y="143"
					width="30"
					height="36"
					rx="6"
					fill={P.amberLight}
				/>
				<Circle cx="85" cy="159" r="8" fill={P.amber} opacity={0.55} />
				<Rect x="107" y="146" width="42" height="5.5" rx="2.5" fill={P.amber} />
				<Rect
					x="107"
					y="156"
					width="32"
					height="4.5"
					rx="2"
					fill={P.amberLight}
				/>
				<Rect x="107" y="165" width="24" height="6" rx="3" fill={P.yellowMid} />
			</AnimatedG>

			{/* Magnifying glass (animated sweep) */}
			<AnimatedG animatedProps={loupeProps}>
				<Circle
					cx="158"
					cy="58"
					r="30"
					fill="rgba(219,234,254,0.88)"
					stroke={P.blueDark}
					strokeWidth="3.5"
				/>
				{/* Lens reflection */}
				<Path
					d="M146,45 Q151,40 158,43"
					stroke={P.white}
					strokeWidth="2.5"
					strokeLinecap="round"
					fill="none"
					opacity={0.75}
				/>
				{/* Inner search icon */}
				<Circle
					cx="158"
					cy="58"
					r="12"
					fill="none"
					stroke={P.blue}
					strokeWidth="2"
					opacity={0.4}
				/>
				{/* Handle */}
				<Line
					x1="181"
					y1="81"
					x2="200"
					y2="100"
					stroke={P.blueDark}
					strokeWidth="5.5"
					strokeLinecap="round"
				/>
			</AnimatedG>

			{/* Location pin (bouncing) */}
			<AnimatedG animatedProps={pinProps}>
				<Path
					d="M16,90 A16,16 0 0 1 48,90 C48,110 32,126 32,126 C32,126 16,110 16,90 Z"
					fill={P.yellow}
				/>
				<Circle cx="32" cy="90" r="7" fill={P.white} />
			</AnimatedG>

			{/* Sparkle star */}
			<AnimatedPath
				animatedProps={sparkProps}
				d="M202,28 L204,35 L211,37 L204,39 L202,46 L200,39 L193,37 L200,35 Z"
				fill={P.amber}
			/>
			<AnimatedCircle
				animatedProps={sparkProps}
				cx="20"
				cy="152"
				r="4.5"
				fill={P.yellowLight}
			/>
			<AnimatedCircle
				animatedProps={sparkProps}
				cx="200"
				cy="145"
				r="3.5"
				fill={P.blueLight}
			/>
		</Svg>
	);
}

// ─── Illustration 3 — Price Tag + Coins ───────────────────────────────────────
function IllustrationSell() {
	const tagRot = useSharedValue(-30);
	const tagSc = useSharedValue(0.2);
	const tagY = useSharedValue(0);

	const coin1Y = useSharedValue(0);
	const coin1Op = useSharedValue(0);
	const coin2Y = useSharedValue(0);
	const coin2Op = useSharedValue(0);
	const coin3Y = useSharedValue(0);
	const coin3Op = useSharedValue(0);

	const chartY = useSharedValue(12);
	const chartOp = useSharedValue(0);
	const sparkOp = useSharedValue(0);
	const checkOp = useSharedValue(0);

	useEffect(() => {
		// Tag swings in with spring
		tagRot.value = withTiming(0, {
			duration: 650,
			easing: Easing.out(Easing.back(1.4)),
		});
		tagSc.value = withTiming(1, {
			duration: 650,
			easing: Easing.out(Easing.back(1.2)),
		});
		// Then bobs
		tagY.value = withDelay(
			700,
			withRepeat(
				withSequence(
					withTiming(-9, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
					withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.sin) }),
				),
				-1,
			),
		);

		// Coins float up in loop
		const coinAnim = (
			opVal: ReturnType<typeof useSharedValue>,
			yVal: ReturnType<typeof useSharedValue>,
			delay: number,
		) => {
			opVal.value = withDelay(
				delay,
				withRepeat(
					withSequence(
						withTiming(1, { duration: 250 }),
						withTiming(1, { duration: 1100 }),
						withTiming(0, { duration: 600 }),
						withTiming(0, { duration: 350 }),
					),
					-1,
				),
			);
			yVal.value = withDelay(
				delay,
				withRepeat(
					withSequence(
						withTiming(-72, {
							duration: 1950,
							easing: Easing.out(Easing.ease),
						}),
						withTiming(0, { duration: 0 }),
						withTiming(0, { duration: 350 }),
					),
					-1,
				),
			);
		};
		coinAnim(coin1Op, coin1Y, 800);
		coinAnim(coin2Op, coin2Y, 1250);
		coinAnim(coin3Op, coin3Y, 1700);

		// Bar chart slides up
		chartOp.value = withDelay(450, withTiming(1, { duration: 380 }));
		chartY.value = withDelay(
			450,
			withRepeat(
				withSequence(
					withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
					withTiming(12, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
				),
				-1,
			),
		);

		// Sparkles
		sparkOp.value = withDelay(
			600,
			withRepeat(
				withSequence(
					withTiming(1, { duration: 600 }),
					withTiming(0.1, { duration: 600 }),
				),
				-1,
			),
		);

		// Check badge
		checkOp.value = withDelay(900, withTiming(1, { duration: 380 }));
	}, [
		// Bar chart slides up
		chartOp,
		chartY, // Check badge
		checkOp,
		coin1Op,
		coin1Y,
		coin2Op,
		coin2Y,
		coin3Op,
		coin3Y, // Sparkles
		sparkOp, // Tag swings in with spring
		tagRot,
		tagSc, // Then bobs
		tagY,
	]);

	const tagProps = useAnimatedProps(() => ({
		rotation: tagRot.value,
		scale: tagSc.value,
		origin: "110, 120",
		translateY: tagY.value,
	}));
	const coin1Props = useAnimatedProps(() => ({
		translateY: coin1Y.value,
		opacity: coin1Op.value,
	}));
	const coin2Props = useAnimatedProps(() => ({
		translateY: coin2Y.value,
		opacity: coin2Op.value,
	}));
	const coin3Props = useAnimatedProps(() => ({
		translateY: coin3Y.value,
		opacity: coin3Op.value,
	}));
	const chartProps = useAnimatedProps(() => ({
		translateY: chartY.value,
		opacity: chartOp.value,
	}));
	const sparkProps = useAnimatedProps(() => ({ opacity: sparkOp.value }));
	const checkProps = useAnimatedProps(() => ({ opacity: checkOp.value }));

	return (
		<Svg width={220} height={220} viewBox="0 0 220 220">
			<Ellipse
				cx="110"
				cy="216"
				rx="68"
				ry="7"
				fill={P.blueDark}
				opacity={0.1}
			/>

			{/* Bar chart (background) */}
			<AnimatedG animatedProps={chartProps}>
				<Rect
					x="152"
					y="140"
					width="14"
					height="26"
					rx="3"
					fill={P.bluePale}
					stroke={P.blueLight}
					strokeWidth="1.5"
				/>
				<Rect
					x="169"
					y="122"
					width="14"
					height="44"
					rx="3"
					fill={P.blueLight}
					stroke={P.blue}
					strokeWidth="1.5"
				/>
				<Rect
					x="186"
					y="106"
					width="14"
					height="60"
					rx="3"
					fill={P.blue}
					stroke={P.blueDark}
					strokeWidth="1.5"
				/>
				{/* Arrow up */}
				<Path
					d="M178,100 L178,82 M166,94 L178,80 L190,94"
					stroke={P.blue}
					strokeWidth="3"
					strokeLinecap="round"
					strokeLinejoin="round"
					fill="none"
				/>
			</AnimatedG>

			{/* Price tag (animated entrance + bob) */}
			<AnimatedG animatedProps={tagProps}>
				{/* String */}
				<Line
					x1="110"
					y1="26"
					x2="110"
					y2="50"
					stroke={P.blueDark}
					strokeWidth="2.5"
				/>
				<Line
					x1="110"
					y1="26"
					x2="130"
					y2="14"
					stroke={P.blueDark}
					strokeWidth="2.5"
				/>
				{/* Tag body */}
				<Path
					d="M62,50 L62,180 A16,16 0 0 0 78,196 L142,196 A16,16 0 0 0 158,180 L158,50 Z"
					fill={P.yellow}
					stroke={P.yellowDark}
					strokeWidth="2.5"
				/>
				{/* Top notch */}
				<Rect
					x="54"
					y="42"
					width="112"
					height="18"
					rx="9"
					fill={P.yellowDark}
				/>
				{/* Hole */}
				<Circle
					cx="110"
					cy="51"
					r="8.5"
					fill={P.white}
					stroke={P.yellowDark}
					strokeWidth="2"
				/>
				{/* Inner white panel */}
				<Rect
					x="74"
					y="76"
					width="72"
					height="98"
					rx="9"
					fill="rgba(255,255,255,0.92)"
				/>
				{/* "PRIX" label */}
				<Rect
					x="84"
					y="84"
					width="52"
					height="7"
					rx="3.5"
					fill={P.yellowLight}
				/>
				{/* Amount block */}
				<Rect x="80" y="102" width="60" height="12" rx="6" fill={P.yellow} />
				<Rect
					x="84"
					y="120"
					width="52"
					height="7"
					rx="3.5"
					fill={P.yellowLight}
				/>
				{/* "XAF" */}
				<Rect x="88" y="134" width="44" height="7" rx="3.5" fill={P.amber} />
				{/* Barcode */}
				{[80, 85, 90, 96, 100, 106, 110, 116, 120, 126, 130, 136].map(
					(x, i) => (
						<Rect
							key={i}
							x={x}
							y="150"
							width={i % 3 === 0 ? 3 : 1.5}
							height="16"
							rx="0.5"
							fill={P.dark}
							opacity={0.55}
						/>
					),
				)}
			</AnimatedG>

			{/* Coin 1 */}
			<AnimatedG animatedProps={coin1Props}>
				<Circle
					cx="46"
					cy="178"
					r="17"
					fill={P.amber}
					stroke={P.yellowDark}
					strokeWidth="2.5"
				/>
				<Circle
					cx="46"
					cy="178"
					r="12"
					fill={P.amber}
					stroke="rgba(255,255,255,0.45)"
					strokeWidth="1.5"
				/>
				<Rect
					x="40"
					y="174"
					width="12"
					height="8"
					rx="1.5"
					fill={P.yellowDark}
					opacity={0.5}
				/>
			</AnimatedG>
			{/* Coin 2 */}
			<AnimatedG animatedProps={coin2Props}>
				<Circle
					cx="24"
					cy="192"
					r="14"
					fill={P.amber}
					stroke={P.yellowDark}
					strokeWidth="2"
				/>
				<Circle
					cx="24"
					cy="192"
					r="9"
					fill={P.amber}
					stroke="rgba(255,255,255,0.4)"
					strokeWidth="1.5"
				/>
			</AnimatedG>
			{/* Coin 3 */}
			<AnimatedG animatedProps={coin3Props}>
				<Circle
					cx="70"
					cy="194"
					r="12"
					fill={P.amber}
					stroke={P.yellowDark}
					strokeWidth="2"
				/>
				<Circle
					cx="70"
					cy="194"
					r="7.5"
					fill={P.amber}
					stroke="rgba(255,255,255,0.4)"
					strokeWidth="1.5"
				/>
			</AnimatedG>

			{/* Sparkles */}
			<AnimatedPath
				animatedProps={sparkProps}
				d="M22,58 L24,66 L32,68 L24,70 L22,78 L20,70 L12,68 L20,66 Z"
				fill={P.amber}
			/>
			<AnimatedPath
				animatedProps={sparkProps}
				d="M196,78 L197.5,83 L203,84.5 L197.5,86 L196,91 L194.5,86 L189,84.5 L194.5,83 Z"
				fill={P.yellowLight}
			/>

			{/* Check badge */}
			<AnimatedG animatedProps={checkProps}>
				<Circle
					cx="178"
					cy="48"
					r="20"
					fill={P.blue}
					stroke={P.white}
					strokeWidth="2.5"
				/>
				<Path
					d="M169,48 L175,55 L189,41"
					stroke={P.white}
					strokeWidth="3"
					strokeLinecap="round"
					strokeLinejoin="round"
					fill="none"
				/>
			</AnimatedG>
		</Svg>
	);
}

// ─── Illustration 4 — Chat Bubbles ────────────────────────────────────────────
function IllustrationChat() {
	const b1Scale = useSharedValue(0);
	const b2Scale = useSharedValue(0);
	const b3Scale = useSharedValue(0);
	const dot1Y = useSharedValue(0);
	const dot2Y = useSharedValue(0);
	const dot3Y = useSharedValue(0);
	const checkOp = useSharedValue(0);
	const shieldOp = useSharedValue(0);
	const notifScale = useSharedValue(0);

	useEffect(() => {
		// Bubbles pop in
		b1Scale.value = withSpring(1, { damping: 11, stiffness: 220 });
		b2Scale.value = withDelay(
			380,
			withSpring(1, { damping: 11, stiffness: 220 }),
		);
		b3Scale.value = withDelay(
			760,
			withSpring(1, { damping: 11, stiffness: 220 }),
		);

		// Typing dots bounce
		const dotLoop = (sv: ReturnType<typeof useSharedValue>, delay: number) => {
			sv.value = withDelay(
				delay,
				withRepeat(
					withSequence(
						withTiming(-9, { duration: 340, easing: Easing.out(Easing.ease) }),
						withTiming(0, { duration: 340, easing: Easing.in(Easing.ease) }),
						withTiming(0, { duration: 320 }),
					),
					-1,
				),
			);
		};
		dotLoop(dot1Y, 1100);
		dotLoop(dot2Y, 1290);
		dotLoop(dot3Y, 1480);

		// Checkmarks
		checkOp.value = withDelay(650, withTiming(1, { duration: 300 }));
		// Shield
		shieldOp.value = withDelay(900, withTiming(1, { duration: 400 }));
		// Notification dot
		notifScale.value = withDelay(
			400,
			withSpring(1, { damping: 8, stiffness: 260 }),
		);
	}, [
		// Bubbles pop in
		b1Scale,
		b2Scale,
		b3Scale, // Checkmarks
		checkOp,
		dot1Y,
		dot2Y,
		dot3Y, // Notification dot
		notifScale, // Shield
		shieldOp,
	]);

	const b1Props = useAnimatedProps(() => ({
		scale: b1Scale.value,
		origin: "42, 65",
	}));
	const b2Props = useAnimatedProps(() => ({
		scale: b2Scale.value,
		origin: "178, 120",
	}));
	const b3Props = useAnimatedProps(() => ({
		scale: b3Scale.value,
		origin: "42, 168",
	}));
	const d1Props = useAnimatedProps(() => ({ translateY: dot1Y.value }));
	const d2Props = useAnimatedProps(() => ({ translateY: dot2Y.value }));
	const d3Props = useAnimatedProps(() => ({ translateY: dot3Y.value }));
	const checkProps = useAnimatedProps(() => ({ opacity: checkOp.value }));
	const shieldProps = useAnimatedProps(() => ({ opacity: shieldOp.value }));
	const notifProps = useAnimatedProps(() => ({
		scale: notifScale.value,
		origin: "196, 38",
	}));

	return (
		<Svg width={220} height={220} viewBox="0 0 220 220">
			{/* Avatar left */}
			<Circle
				cx="20"
				cy="65"
				r="17"
				fill={P.bluePale}
				stroke={P.blue}
				strokeWidth="2"
			/>
			<Circle cx="20" cy="60" r="7" fill={P.blueLight} />
			<Ellipse cx="20" cy="76" rx="10" ry="7" fill={P.blueLight} />

			{/* Avatar right */}
			<Circle
				cx="200"
				cy="120"
				r="17"
				fill={P.yellowPale}
				stroke={P.yellow}
				strokeWidth="2"
			/>
			<Circle cx="200" cy="115" r="7" fill={P.yellowLight} />
			<Ellipse cx="200" cy="131" rx="10" ry="7" fill={P.yellowLight} />

			{/* Notification badge on right avatar */}
			<AnimatedG animatedProps={notifProps}>
				<Circle
					cx="196"
					cy="104"
					r="8"
					fill={P.yellow}
					stroke={P.white}
					strokeWidth="1.5"
				/>
				<Rect
					x="193"
					y="100"
					width="6"
					height="5"
					rx="1"
					fill={P.white}
					opacity={0.9}
				/>
				<Rect
					x="193"
					y="107"
					width="6"
					height="2"
					rx="1"
					fill={P.white}
					opacity={0.9}
				/>
			</AnimatedG>

			{/* Bubble 1 — Blue (left) */}
			<AnimatedG animatedProps={b1Props}>
				<Rect x="44" y="36" width="140" height="58" rx="18" fill={P.blue} />
				{/* Tail */}
				<Path d="M56,94 L38,112 L72,94 Z" fill={P.blue} />
				{/* Message lines */}
				<Rect
					x="62"
					y="50"
					width="100"
					height="7"
					rx="3.5"
					fill="rgba(255,255,255,0.8)"
				/>
				<Rect
					x="62"
					y="63"
					width="78"
					height="7"
					rx="3.5"
					fill="rgba(255,255,255,0.55)"
				/>
				<Rect
					x="62"
					y="76"
					width="88"
					height="7"
					rx="3.5"
					fill="rgba(255,255,255,0.55)"
				/>
			</AnimatedG>

			{/* Bubble 2 — Orange (right) */}
			<AnimatedG animatedProps={b2Props}>
				<Rect x="36" y="98" width="140" height="52" rx="18" fill={P.yellow} />
				{/* Tail */}
				<Path d="M164,150 L182,168 L148,150 Z" fill={P.yellow} />
				{/* Message lines */}
				<Rect
					x="52"
					y="112"
					width="96"
					height="7"
					rx="3.5"
					fill="rgba(255,255,255,0.8)"
				/>
				<Rect
					x="52"
					y="126"
					width="72"
					height="7"
					rx="3.5"
					fill="rgba(255,255,255,0.55)"
				/>
				{/* Double check */}
				<AnimatedG animatedProps={checkProps}>
					<Path
						d="M153,136 L157,140 L165,131"
						stroke="rgba(255,255,255,0.95)"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						fill="none"
					/>
					<Path
						d="M148,136 L152,140 L160,131"
						stroke="rgba(255,255,255,0.65)"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						fill="none"
					/>
				</AnimatedG>
			</AnimatedG>

			{/* Bubble 3 — typing indicator (blue, left) */}
			<AnimatedG animatedProps={b3Props}>
				<Rect
					x="44"
					y="158"
					width="90"
					height="44"
					rx="18"
					fill={P.bluePale}
					stroke={P.blue}
					strokeWidth="1.5"
				/>
				<Path d="M56,202 L38,216 L70,202 Z" fill={P.bluePale} />
				{/* Bouncing dots */}
				<AnimatedCircle
					animatedProps={d1Props}
					cx="74"
					cy="180"
					r="6.5"
					fill={P.blue}
				/>
				<AnimatedCircle
					animatedProps={d2Props}
					cx="94"
					cy="180"
					r="6.5"
					fill={P.blue}
				/>
				<AnimatedCircle
					animatedProps={d3Props}
					cx="114"
					cy="180"
					r="6.5"
					fill={P.blue}
				/>
			</AnimatedG>

			{/* Shield badge */}
			<AnimatedG animatedProps={shieldProps}>
				<Path
					d="M188,12 L210,20 L210,37 A22,22 0 0 1 188,56 A22,22 0 0 1 166,37 L166,20 Z"
					fill={P.blue}
					stroke={P.white}
					strokeWidth="2"
				/>
				<Path
					d="M180,34 L186,41 L198,28"
					stroke={P.white}
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					fill="none"
				/>
			</AnimatedG>

			{/* Decorative dots */}
			<Circle cx="14" cy="172" r="4.5" fill={P.amber} opacity={0.65} />
			<Circle cx="206" cy="172" r="3.5" fill={P.yellowLight} opacity={0.65} />
		</Svg>
	);
}

// ─── Slide illustrations map ──────────────────────────────────────────────────
const ILLUSTRATIONS = [
	IllustrationStore,
	IllustrationSearch,
	IllustrationSell,
	IllustrationChat,
];

// ─── Dot indicator ────────────────────────────────────────────────────────────
function Dot({
	index,
	currentIndex,
	colors,
}: {
	index: number;
	currentIndex: number;
	colors: (typeof Colors)["light"];
}) {
	const isActive = index === currentIndex;
	const w = useSharedValue(isActive ? 28 : 8);

	useEffect(() => {
		w.value = withSpring(isActive ? 28 : 8, { damping: 14, stiffness: 280 });
	}, [isActive, w]);

	const style = useAnimatedStyle(() => ({ width: w.value }));

	return (
		<Animated.View
			style={[
				dotStyles.dot,
				{ backgroundColor: isActive ? colors.primary : colors.border },
				style,
			]}
		/>
	);
}

const dotStyles = StyleSheet.create({
	dot: { height: 8, borderRadius: 4 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
	const isDark = useColorScheme() === "dark";
	const colors = isDark ? Colors.dark : Colors.light;
	const [currentIndex, setCurrentIndex] = useState(0);
	const flatListRef = useRef<FlatList>(null);

	const isLast = currentIndex === SLIDES.length - 1;

	const onViewableItemsChanged = useRef(
		({ viewableItems }: { viewableItems: ViewToken[] }) => {
			if (viewableItems[0]?.index != null) {
				setCurrentIndex(viewableItems[0].index);
			}
		},
	).current;

	const goNext = () => {
		if (isLast) return handleComplete();
		flatListRef.current?.scrollToIndex({
			index: currentIndex + 1,
			animated: true,
		});
	};

	const handleComplete = async () => {
		await AsyncStorage.setItem("hasSeenOnboarding", "true");
		router.replace("/(tabs)/home");
	};

	const renderSlide = ({
		item,
		index,
	}: {
		item: (typeof SLIDES)[number];
		index: number;
	}) => {
		const IllustrationComponent = ILLUSTRATIONS[index];
		const bg = isDark ? item.bgDark : item.bgLight;

		return (
			<View style={[styles.slide, { width: SW }]}>
				{/* Illustration card */}
				<View style={[styles.illustCard, { backgroundColor: bg }]}>
					<IllustrationComponent />
				</View>

				{/* Logo + title */}
				<View style={styles.textBlock}>
					{index === 0 && (
						<View style={styles.logoRow}>
							<Image
								source={require("@/assets/icon2.png")}
								style={styles.logoImg}
								contentFit="contain"
							/>
						</View>
					)}
					<Text style={[styles.slideTitle, { color: colors.foreground }]}>
						{item.title}
					</Text>
					<Text style={[styles.slideDesc, { color: colors.mutedForeground }]}>
						{item.description}
					</Text>
				</View>
			</View>
		);
	};

	return (
		<SafeAreaView
			style={[styles.container, { backgroundColor: colors.background }]}
		>
			<StatusBar style={isDark ? "light" : "dark"} />

			{/* Skip */}
			{!isLast && (
				<Pressable style={styles.skipBtn} onPress={handleComplete} hitSlop={12}>
					<Text style={[styles.skipText, { color: colors.mutedForeground }]}>
						Ignorer
					</Text>
				</Pressable>
			)}

			{/* Slides */}
			<FlatList
				ref={flatListRef}
				data={SLIDES}
				renderItem={renderSlide}
				keyExtractor={(item) => item.id}
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				onViewableItemsChanged={onViewableItemsChanged}
				viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
			/>

			{/* Bottom controls */}
			<View style={styles.bottomBar}>
				<View style={styles.dotsRow}>
					{SLIDES.map((_, i) => (
						<Dot
							key={i}
							index={i}
							currentIndex={currentIndex}
							colors={colors}
						/>
					))}
				</View>

				<Pressable
					style={({ pressed }) => [
						styles.nextBtn,
						{ backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
					]}
					onPress={goNext}
				>
					<Text style={styles.nextBtnText}>
						{isLast ? "Commencer" : "Suivant →"}
					</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
	container: { flex: 1 },
	skipBtn: {
		position: "absolute",
		top: 56,
		right: 24,
		zIndex: 10,
		paddingVertical: 6,
		paddingHorizontal: 12,
	},
	skipText: { fontFamily: Fonts.bodySemibold, fontSize: 15 },
	slide: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 28,
		gap: 28,
	},
	illustCard: {
		width: 240,
		height: 240,
		borderRadius: 36,
		alignItems: "center",
		justifyContent: "center",
		...shadows.lg,
	},
	textBlock: { alignItems: "center", gap: 12 },
	logoRow: { marginBottom: 4 },
	logoImg: { width: 52, height: 52, borderRadius: 14 },
	slideTitle: {
		fontFamily: Fonts.displayExtrabold,
		fontSize: 30,
		letterSpacing: -0.5,
		textAlign: "center",
		lineHeight: 38,
	},
	slideDesc: {
		fontFamily: Fonts.body,
		fontSize: 15,
		lineHeight: 23,
		textAlign: "center",
		maxWidth: 310,
	},
	bottomBar: {
		paddingHorizontal: 24,
		paddingBottom: 24,
		gap: 20,
	},
	dotsRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
	},
	nextBtn: {
		height: 54,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
		...shadows.md,
	},
	nextBtnText: {
		fontFamily: Fonts.displayBold,
		fontSize: 16,
		color: "#ffffff",
	},
});
