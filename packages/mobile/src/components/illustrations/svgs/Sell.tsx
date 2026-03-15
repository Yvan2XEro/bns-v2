import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";
import {
	ACircle,
	AG,
	APath,
	ARect,
	useFloatG,
	useFloatY,
	usePulse,
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

export default function Sell({ color = B.base, size = 200 }: Props) {
	// Tag floats up/down
	const tagFloat = useFloatG(9, 2600, 0);
	// Ambient glow
	const glow = usePulse(0.05, 0.18, 2200, 0);
	// Coins float upward
	const coin1 = useFloatY(148, 22, 2000, 0);
	const coin2 = useFloatY(155, 18, 2400, 500);
	const coin3 = useFloatY(162, 15, 2800, 900);
	// Coin stack shine
	const coinShine = usePulse(0.2, 0.7, 1400, 200);
	// Price tag shine
	const tagShine = useWaveOpacity(0.25, 0.8, 1800, 0);
	// Chart bars pulse
	const bar1 = usePulse(0.5, 1, 1600, 0);
	const bar2 = usePulse(0.5, 1, 1600, 300);
	const bar3 = usePulse(0.5, 1, 1600, 600);
	// Sparkles
	const spark1 = usePulse(0.1, 0.8, 1300, 0);
	const spark2 = usePulse(0.08, 0.65, 1600, 400);

	return (
		<Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
			<Ellipse cx={100} cy={168} rx={58} ry={9} fill={B.dark} opacity={0.1} />
			<ACircle animatedProps={glow} cx={100} cy={95} r={72} fill={color} />

			{/* Bar chart (background right) */}
			<ARect
				animatedProps={bar1}
				x={148}
				y={140}
				width={12}
				height={22}
				rx={3}
				fill={B.pale}
				stroke={B.light}
				strokeWidth={1.5}
			/>
			<ARect
				animatedProps={bar2}
				x={163}
				y={122}
				width={12}
				height={40}
				rx={3}
				fill={B.light}
				stroke={color}
				strokeWidth={1.5}
			/>
			<ARect
				animatedProps={bar3}
				x={178}
				y={105}
				width={12}
				height={57}
				rx={3}
				fill={color}
				stroke={B.dark}
				strokeWidth={1.5}
			/>
			{/* Arrow */}
			<Path
				d="M176,100 L176,80 M163,93 L176,79 L189,93"
				stroke={color}
				strokeWidth={3}
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
			/>

			{/* Coin stack */}
			<Ellipse
				cx={50}
				cy={158}
				rx={20}
				ry={7}
				fill={Y.mid}
				opacity={0.2}
				stroke={Y.base}
				strokeWidth={1.5}
			/>
			<Rect
				x={30}
				y={142}
				width={40}
				height={16}
				rx={2}
				fill={Y.mid}
				opacity={0.15}
				stroke={Y.base}
				strokeWidth={1.5}
			/>
			<Ellipse
				cx={50}
				cy={142}
				rx={20}
				ry={7}
				fill={Y.mid}
				opacity={0.3}
				stroke={Y.base}
				strokeWidth={1.5}
			/>
			<Rect
				x={30}
				y={128}
				width={40}
				height={14}
				rx={2}
				fill={Y.mid}
				opacity={0.2}
				stroke={Y.base}
				strokeWidth={1.5}
			/>
			<Ellipse
				cx={50}
				cy={128}
				rx={20}
				ry={7}
				fill={Y.mid}
				opacity={0.45}
				stroke={Y.base}
				strokeWidth={1.5}
			/>
			<Rect
				x={30}
				y={115}
				width={40}
				height={13}
				rx={2}
				fill={Y.mid}
				opacity={0.3}
				stroke={Y.base}
				strokeWidth={1.5}
			/>
			{/* Top coin (most visible) */}
			<Ellipse
				cx={50}
				cy={115}
				rx={20}
				ry={7}
				fill={Y.mid}
				opacity={0.65}
				stroke={Y.base}
				strokeWidth={2}
			/>
			{/* Coin shine */}
			<APath
				animatedProps={coinShine}
				d="M38,112 Q50,108 62,112"
				stroke="#fff"
				strokeWidth={2}
				strokeLinecap="round"
			/>
			{/* XAF on coin */}
			<Ellipse cx={50} cy={115} rx={12} ry={4} fill={Y.base} opacity={0.3} />

			{/* Floating coin particles */}
			<ACircle
				animatedProps={coin1}
				cx={38}
				r={8}
				fill={Y.mid}
				opacity={0.5}
				stroke={Y.base}
				strokeWidth={1.5}
			/>
			<ACircle
				animatedProps={coin2}
				cx={56}
				r={6}
				fill={Y.mid}
				opacity={0.4}
				stroke={Y.base}
				strokeWidth={1.5}
			/>
			<ACircle
				animatedProps={coin3}
				cx={28}
				r={5}
				fill={Y.mid}
				opacity={0.35}
			/>

			{/* Orange price tag (floating) */}
			<AG animatedProps={tagFloat}>
				{/* String */}
				<Path
					d="M100,28 L100,48 M100,28 L118,18"
					stroke={B.dark}
					strokeWidth={2.5}
					strokeLinecap="round"
				/>
				{/* Tag body */}
				<Path
					d="M68,48 L68,172 a14,14 0 0 0 14,14 h36a14,14 0 0 0 14,-14 L132,48 Z"
					fill={Y.base}
					stroke={Y.mid}
					strokeWidth={2}
				/>
				{/* Tag top notch */}
				<Rect x={60} y={40} width={80} height={16} rx={8} fill={Y.mid} />
				{/* Hole */}
				<Circle
					cx={100}
					cy={48}
					r={7}
					fill="#fff"
					stroke={Y.base}
					strokeWidth={1.5}
				/>
				{/* White price panel */}
				<Rect
					x={76}
					y={72}
					width={48}
					height={88}
					rx={8}
					fill="rgba(255,255,255,0.92)"
				/>
				{/* PRIX label */}
				<Rect x={82} y={80} width={36} height={6} rx={3} fill={Y.light} />
				{/* Amount */}
				<Rect x={80} y={96} width={40} height={10} rx={5} fill={Y.base} />
				<Rect x={82} y={112} width={36} height={6} rx={3} fill={Y.light} />
				{/* XAF */}
				<Rect x={84} y={124} width={32} height={6} rx={3} fill={Y.mid} />
				{/* Tag shine */}
				<APath
					animatedProps={tagShine}
					d="M80,60 Q100,54 120,60"
					stroke="#fff"
					strokeWidth={2}
					strokeLinecap="round"
					opacity={0.7}
				/>
				{/* Barcode */}
				{[79, 84, 88, 93, 97, 102, 106, 111, 115, 120].map((x, i) => (
					<Rect
						key={i}
						x={x}
						y={140}
						width={i % 3 === 0 ? 3 : 1.5}
						height={14}
						rx={0.5}
						fill={B.dark}
						opacity={0.5}
					/>
				))}
			</AG>

			{/* Sparkles */}
			<APath animatedProps={spark1} d="M24,58 l2,6 -2,6 -2,-6z" fill={Y.mid} />
			<APath
				animatedProps={spark2}
				d="M174,68 l1.5,4.5 -1.5,4.5 -1.5,-4.5z"
				fill={color}
			/>
			<ACircle animatedProps={spark1} cx={170} cy={48} r={3} fill={Y.light} />
			<ACircle animatedProps={spark2} cx={26} cy={88} r={2.5} fill={color} />
		</Svg>
	);
}
