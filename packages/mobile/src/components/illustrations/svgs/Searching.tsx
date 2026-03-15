import Svg, { Circle, Ellipse, Line, Path, Rect } from "react-native-svg";
import {
	ACircle,
	AG,
	APath,
	ARect,
	usePulse,
	useSweepX,
	useWaveOpacity,
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

export default function Searching({ color = B.base, size = 200 }: Props) {
	// Magnifying glass sweeps over cards
	const loupe = useSweepX(18, 1600, 400);
	// Glow behind loupe
	const glowPulse = usePulse(0.06, 0.2, 1800, 200);
	// Orange result highlight pulses
	const highlight = usePulse(0.15, 0.55, 1400, 0);
	// Sparkles at lens
	const spark1 = usePulse(0.1, 0.75, 1200, 0);
	const spark2 = usePulse(0.08, 0.6, 1500, 350);
	const spark3 = usePulse(0.1, 0.65, 1700, 700);
	// Shine in lens
	const shine = useWaveOpacity(0.2, 0.75, 1400, 100);
	// Card line shimmers
	const shimmer = usePulse(0.3, 0.7, 2000, 0);

	return (
		<Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
			<Ellipse cx={100} cy={168} rx={55} ry={8} fill={B.dark} opacity={0.1} />
			{/* Background ambient */}
			<Circle cx={90} cy={100} r={72} fill={color} opacity={0.04} />

			{/* Document stack — back */}
			<Rect
				x={40}
				y={55}
				width={82}
				height={100}
				rx={8}
				fill="#E2E8F0"
				opacity={0.45}
			/>
			<Rect
				x={45}
				y={50}
				width={82}
				height={100}
				rx={8}
				fill="#F1F5F9"
				opacity={0.8}
			/>
			{/* Document front */}
			<Rect
				x={50}
				y={45}
				width={82}
				height={100}
				rx={8}
				fill="#fff"
				stroke={B.light}
				strokeWidth={1.5}
			/>

			{/* Document lines */}
			<Rect x={63} y={60} width={52} height={5} rx={2.5} fill={B.pale} />
			<Rect x={63} y={72} width={44} height={4} rx={2} fill={B.pale} />
			<Rect x={63} y={82} width={58} height={4} rx={2} fill={B.pale} />
			<Rect x={63} y={92} width={38} height={4} rx={2} fill={B.pale} />
			<Rect x={63} y={102} width={50} height={4} rx={2} fill={B.pale} />

			{/* Orange highlighted result row */}
			<ARect
				animatedProps={highlight}
				x={58}
				y={114}
				width={68}
				height={12}
				rx={4}
				fill={Y.mid}
			/>
			<Rect
				x={63}
				y={117}
				width={36}
				height={4}
				rx={2}
				fill={Y.base}
				opacity={0.6}
			/>

			{/* Price tag on doc */}
			<Rect
				x={63}
				y={130}
				width={24}
				height={9}
				rx={4.5}
				fill={color}
				opacity={0.15}
			/>
			<Path
				d="M67,134.5 h16"
				stroke={color}
				opacity={0.4}
				strokeWidth={1.5}
				strokeLinecap="round"
			/>

			{/* Magnifying glass (sweeping) */}
			<AG animatedProps={loupe}>
				{/* Glow behind glass */}
				<ACircle
					animatedProps={glowPulse}
					cx={134}
					cy={108}
					r={34}
					fill={color}
				/>
				{/* Glass ring */}
				<Circle
					cx={134}
					cy={108}
					r={26}
					fill="rgba(219,234,254,0.92)"
					stroke={color}
					strokeWidth={3}
				/>
				{/* Lens inner circle */}
				<Circle
					cx={134}
					cy={108}
					r={18}
					fill="rgba(255,255,255,0.6)"
					stroke={B.light}
					strokeWidth={1}
				/>
				{/* Lens shine */}
				<APath
					animatedProps={shine}
					d="M123,97 Q128,91 136,94"
					stroke="#fff"
					strokeWidth={2.5}
					strokeLinecap="round"
				/>
				{/* Orange cross-hair center */}
				<Circle cx={134} cy={108} r={4} fill={Y.mid} opacity={0.55} />
				{/* Handle */}
				<Line
					x1={153}
					y1={127}
					x2={170}
					y2={144}
					stroke={color}
					strokeWidth={5}
					strokeLinecap="round"
				/>
				{/* Handle grip lines */}
				<Line
					x1={157}
					y1={131}
					x2={165}
					y2={139}
					stroke={B.light}
					strokeWidth={2}
					strokeLinecap="round"
					opacity={0.5}
				/>

				{/* Sparkles at lens */}
				<ACircle animatedProps={spark1} cx={160} cy={88} r={3.5} fill={Y.mid} />
				<ACircle animatedProps={spark2} cx={114} cy={84} r={2.5} fill={color} />
				<APath
					animatedProps={spark3}
					d="M168,96 l1.5,4 -1.5,4 -1.5,-4z"
					fill={Y.mid}
				/>
			</AG>

			{/* Card shimmer line */}
			<ARect
				animatedProps={shimmer}
				x={63}
				y={62}
				width={52}
				height={5}
				rx={2.5}
				fill={color}
				opacity={0.3}
			/>

			{/* Ambient sparkles */}
			<ACircle animatedProps={spark1} cx={36} cy={128} r={4} fill={color} />
			<ACircle animatedProps={spark2} cx={164} cy={50} r={3} fill={Y.light} />
			<APath animatedProps={spark3} d="M174,70 l2,5 -2,5 -2,-5z" fill={Y.mid} />
		</Svg>
	);
}
