import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";
import {
	ACircle,
	AG,
	APath,
	usePulse,
	usePulseR,
	useScalePulse,
	useWaveOpacity,
	useWiggle,
} from "../animated";

const B = {
	base: "#1e40af",
	mid: "#3b82f6",
	light: "#93c5fd",
	pale: "#dbeafe",
	dark: "#1e3a8a",
};
const Y = {
	dark: "#b45309",
	base: "#d97706",
	mid: "#f59e0b",
	light: "#fbbf24",
	pale: "#fef3c7",
};

type Props = { color?: string; size?: number };

export default function Auth({ color = B.base, size = 200 }: Props) {
	// Expanding ripple rings
	const ring1 = usePulseR(58, 80, 2200, 0);
	const ring2 = usePulseR(46, 68, 2200, 600);
	const ring3 = usePulseR(34, 56, 2200, 1200);
	// Ring opacities (fade as they expand)
	const _ringOp1 = usePulse(0.14, 0.02, 2200, 0);
	const _ringOp2 = usePulse(0.1, 0.02, 2200, 600);
	const _ringOp3 = usePulse(0.08, 0.02, 2200, 1200);
	// Shield breathes
	const shield = useScalePulse(0.97, 1.03, 2000, 0);
	// Lock wiggles subtly
	const lock = useWiggle(4, 2400, 800);
	// Keyhole blinks
	const keyhole = useWaveOpacity(0.4, 1, 1800, 300);
	// Orange shackle glow
	const shackle = usePulse(0.5, 1, 1600, 0);
	// Sparkles
	const spark1 = usePulse(0.1, 0.8, 1300, 0);
	const spark2 = usePulse(0.08, 0.65, 1600, 450);
	const spark3 = usePulse(0.1, 0.7, 1900, 850);

	return (
		<Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
			<Ellipse cx={100} cy={164} rx={52} ry={8} fill={B.dark} opacity={0.1} />

			{/* Expanding ripple rings */}
			<ACircle
				animatedProps={ring1}
				cx={100}
				cy={96}
				fill="none"
				stroke={color}
				strokeWidth={1.5}
				opacity={0.14}
			/>
			<ACircle
				animatedProps={ring2}
				cx={100}
				cy={96}
				fill="none"
				stroke={Y.base}
				strokeWidth={1}
				opacity={0.1}
			/>
			<ACircle
				animatedProps={ring3}
				cx={100}
				cy={96}
				fill="none"
				stroke={color}
				strokeWidth={0.8}
				opacity={0.08}
			/>

			{/* Shield (breathing) */}
			<AG animatedProps={shield} origin="100,96">
				{/* Shield shadow */}
				<Path
					d="M100,150 c-32,-9-54,-30-54,-56 V62 l54,-22 54,22 v32 c0,26-22,47-54,56z"
					fill={B.dark}
					opacity={0.08}
					transform="translate(3,5)"
				/>
				{/* Shield body */}
				<Path
					d="M100,146 c-30,-8-50,-28-50,-52 V60 l50,-20 50,20 v34 c0,24-20,44-50,52z"
					fill="#fff"
					stroke={color}
					strokeWidth={2.5}
				/>
				{/* Shield inner fill */}
				<Path
					d="M100,138 c-24,-7-40,-22-40,-42 V66 l40,-16 40,16 v30 c0,20-16,35-40,42z"
					fill={color}
					opacity={0.08}
				/>
				{/* Orange shield accent band */}
				<Path
					d="M58,80 L142,80 L140,96 a50,50 0 0 1-80,0 Z"
					fill={Y.base}
					opacity={0.12}
				/>
				{/* Shield emblem — star / crest */}
				<Path
					d="M100,70 l3,8 8,0 -6.5,5 2.5,8 -7,-5 -7,5 2.5,-8 -6.5,-5 8,0z"
					fill={color}
					opacity={0.2}
				/>
			</AG>

			{/* Lock body (wiggling) */}
			<AG animatedProps={lock} origin="100,110">
				{/* Lock body */}
				<Rect x={82} y={96} width={36} height={28} rx={6} fill={Y.base} />
				{/* Lock shine */}
				<Rect
					x={84}
					y={98}
					width={14}
					height={4}
					rx={2}
					fill={Y.light}
					opacity={0.5}
				/>
				{/* Shackle (orange arc) */}
				<APath
					animatedProps={shackle}
					d="M88,96 V84 a12,12 0 0 1 24,0 V96"
					stroke={Y.mid}
					strokeWidth={4}
					strokeLinecap="round"
					fill="none"
				/>
				{/* Keyhole */}
				<APath
					animatedProps={keyhole}
					d="M100,104 a5,5 0 1 0 0.01,0 M100,109 v6"
					stroke="#fff"
					strokeWidth={2}
					strokeLinecap="round"
					fill="none"
				/>
			</AG>

			{/* Sparkles — blue */}
			<APath
				animatedProps={spark1}
				d="M36,72  l2,6   -2,6   -2,-6z"
				fill={color}
			/>
			<ACircle animatedProps={spark2} cx={166} cy={68} r={3.5} fill={color} />
			{/* Sparkles — orange */}
			<APath
				animatedProps={spark3}
				d="M162,120 l1.5,4.5 -1.5,4.5 -1.5,-4.5z"
				fill={Y.mid}
			/>
			<ACircle animatedProps={spark1} cx={40} cy={116} r={2.5} fill={Y.light} />
			{/* Corner dots */}
			<Circle cx={155} cy={52} r={3} fill={Y.mid} opacity={0.4} />
			<Circle cx={45} cy={52} r={3} fill={B.light} opacity={0.4} />
		</Svg>
	);
}
