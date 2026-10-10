import { ACircle, AG, APath, floatG, pulse, waveOpacity } from "../animated";

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

export default function NoMessages({ color = B.base, size = 200 }: Props) {
	// Blue bubble glow
	const bubbleGlow = pulse(0.05, 0.16, 2400, 0);
	// Typing dots (wave)
	const dot1 = waveOpacity(0.15, 1, 600, 0);
	const dot2 = waveOpacity(0.15, 1, 600, 200);
	const dot3 = waveOpacity(0.15, 1, 600, 400);
	// Paper plane flies in
	const planeFloat = floatG(6, 2200, 0);
	// Orange bubble subtle pulse
	const orangePulse = pulse(0.08, 0.22, 2600, 300);
	// Sparkles
	const spark1 = pulse(0.1, 0.75, 1300, 0);
	const spark2 = pulse(0.08, 0.6, 1600, 450);
	const spark3 = pulse(0.1, 0.7, 1900, 800);

	return (
		<svg
			className="ill"
			aria-hidden="true"
			focusable="false"
			width={size}
			height={size}
			viewBox="0 0 200 200"
			fill="none"
		>
			<ellipse cx={100} cy={166} rx={54} ry={8} fill={B.dark} opacity={0.1} />
			{/* Background glow */}
			<ACircle anim={bubbleGlow} cx={100} cy={96} r={74} fill={color} />

			{/* Orange bubble (right, secondary) */}
			<ACircle anim={orangePulse} cx={148} cy={58} r={48} fill={Y.base} />
			<path
				d="M115,40 h50a12,12 0 0 1 12,12 v30a12,12 0 0 1-12,12 h-14l-10,12 V94 h-26a12,12 0 0 1-12,-12 V52a12,12 0 0 1 12,-12z"
				fill={Y.pale}
				stroke={Y.base}
				strokeWidth={2}
			/>
			{/* Orange bubble lines */}
			<rect
				x={124}
				y={58}
				width={38}
				height={4}
				rx={2}
				fill={Y.base}
				opacity={0.4}
			/>
			<rect
				x={124}
				y={68}
				width={28}
				height={4}
				rx={2}
				fill={Y.base}
				opacity={0.28}
			/>
			<rect
				x={124}
				y={78}
				width={34}
				height={4}
				rx={2}
				fill={Y.base}
				opacity={0.28}
			/>
			{/* Orange dot (typing) */}
			<circle cx={154} cy={87} r={4} fill={Y.mid} opacity={0.5} />

			{/* Main blue bubble */}
			<path
				d="M28,70 h108a16,16 0 0 1 16,16 v46a16,16 0 0 1-16,16 H74L55,166 V148H28a16,16 0 0 1-16,-16 V86a16,16 0 0 1 16,-16z"
				fill="#fff"
				stroke={color}
				strokeWidth={2.5}
			/>
			{/* Blue bubble lines */}
			<rect x={42} y={88} width={80} height={5} rx={2.5} fill={B.pale} />
			<rect x={42} y={100} width={64} height={4} rx={2} fill={B.pale} />

			{/* Animated typing dots */}
			<ACircle anim={dot1} cx={62} cy={128} r={6} fill={color} />
			<ACircle anim={dot2} cx={82} cy={128} r={6} fill={color} />
			<ACircle anim={dot3} cx={102} cy={128} r={6} fill={color} />

			{/* Paper plane (floating) */}
			<AG anim={planeFloat}>
				<path
					d="M152,118 L168,108 L156,128 Z"
					fill={Y.mid}
					stroke={Y.base}
					strokeWidth={1.5}
					strokeLinejoin="round"
				/>
				<path d="M152,118 L162,120 L156,128 Z" fill={Y.mid} opacity={0.7} />
				{/* Trail */}
				<line
					x1={148}
					y1={116}
					x2={138}
					y2={120}
					stroke={Y.light}
					strokeWidth={1.5}
					strokeLinecap="round"
					opacity={0.6}
				/>
				<line
					x1={144}
					y1={120}
					x2={132}
					y2={126}
					stroke={Y.light}
					strokeWidth={1}
					strokeLinecap="round"
					opacity={0.4}
				/>
			</AG>

			{/* Sparkles */}
			<APath anim={spark1} d="M18,140 l2,5.5 -2,5.5 -2,-5.5z" fill={color} />
			<ACircle anim={spark2} cx={170} cy={130} r={3.5} fill={Y.mid} />
			<APath anim={spark3} d="M28,48  l2,5   -2,5   -2,-5z" fill={Y.mid} />
			<ACircle anim={spark1} cx={168} cy={58} r={2.5} fill={color} />
		</svg>
	);
}
