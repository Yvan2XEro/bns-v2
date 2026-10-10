import {
	ACircle,
	AG,
	APath,
	floatG,
	floatY,
	pulse,
	waveOpacity,
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

export default function Empty({ color = B.base, size = 200 }: Props) {
	const boxFloat = floatG(8, 2800);
	const p1 = floatY(80, 28, 2600, 0);
	const p2 = floatY(74, 20, 3100, 450);
	const p3 = floatY(86, 18, 2900, 850);
	const glowIn = pulse(0.1, 0.3, 2200);
	const dust1 = waveOpacity(0.05, 0.45, 900, 0);
	const dust2 = waveOpacity(0.05, 0.4, 900, 300);
	const spark1 = pulse(0.1, 0.8, 1300, 0);
	const spark2 = pulse(0.1, 0.65, 1600, 400);
	const spark3 = pulse(0.08, 0.55, 1900, 750);

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
			{/* Shadow */}
			<ellipse cx={100} cy={168} rx={58} ry={9} fill={B.dark} opacity={0.12} />

			{/* Floating box */}
			<AG anim={boxFloat}>
				{/* Box — back face */}
				<path
					d="M55,148 L55,90 L145,90 L145,148 Z"
					fill={B.pale}
					opacity={0.6}
				/>
				{/* Box — left 3D side */}
				<path
					d="M35,130 L55,148 L55,90 L35,72 Z"
					fill={B.mid}
					opacity={0.18}
					stroke={color}
					strokeWidth={1.5}
				/>
				{/* Box — front face */}
				<rect
					x={55}
					y={100}
					width={90}
					height={48}
					rx={2}
					fill={B.pale}
					stroke={color}
					strokeWidth={2}
				/>
				{/* Box — left face border */}
				<path
					d="M35,82 L55,100 L55,148 L35,130 Z"
					fill="none"
					stroke={color}
					strokeWidth={1.5}
				/>
				{/* Left flap open */}
				<path
					d="M55,100 L35,82 L68,58 L88,76 Z"
					fill={B.pale}
					stroke={color}
					strokeWidth={1.5}
				/>
				{/* Right flap open */}
				<path
					d="M145,100 L165,82 L132,58 L112,76 Z"
					fill={B.pale}
					stroke={color}
					strokeWidth={1.5}
				/>
				{/* Flap crease lines */}
				<path d="M55,100 L88,76" stroke={color} strokeWidth={1} opacity={0.3} />
				<path
					d="M145,100 L112,76"
					stroke={color}
					strokeWidth={1}
					opacity={0.3}
				/>

				{/* Orange tape — vertical */}
				<rect
					x={78}
					y={100}
					width={5}
					height={48}
					rx={1}
					fill={Y.mid}
					opacity={0.65}
				/>
				{/* Orange tape — horizontal */}
				<rect
					x={55}
					y={121}
					width={90}
					height={4}
					rx={1}
					fill={Y.mid}
					opacity={0.5}
				/>
				{/* Tape on left flap */}
				<rect
					x={60}
					y={64}
					width={26}
					height={4}
					rx={2}
					fill={Y.mid}
					opacity={0.5}
				/>

				{/* Inside darkness */}
				<path
					d="M55,100 L88,76 L112,76 L145,100 Z"
					fill={B.dark}
					opacity={0.14}
				/>
				{/* Inside glow */}
				<ACircle anim={glowIn} cx={100} cy={94} r={18} fill={color} />

				{/* Logo mark on box */}
				<rect
					x={67}
					y={112}
					width={42}
					height={12}
					rx={4}
					fill={color}
					opacity={0.1}
				/>
				<path
					d="M73,118 h30"
					stroke={color}
					opacity={0.28}
					strokeWidth={1.5}
					strokeLinecap="round"
				/>

				{/* Dust escaping */}
				<ACircle anim={dust1} cx={90} cy={82} r={3} fill={Y.mid} />
				<ACircle anim={dust2} cx={113} cy={78} r={2} fill={color} />
			</AG>

			{/* Floating particles rising */}
			<ACircle anim={p1} cx={95} r={4} fill={color} opacity={0.22} />
			<ACircle anim={p2} cx={112} r={2.5} fill={Y.mid} opacity={0.28} />
			<ACircle anim={p3} cx={80} r={3} fill={Y.light} opacity={0.2} />

			{/* Sparkles — blue */}
			<APath anim={spark1} d="M163,52 l2,6 -2,6 -2,-6z" fill={color} />
			<APath anim={spark2} d="M37,70  l2,5 -2,5 -2,-5z" fill={color} />
			{/* Sparkles — orange/amber */}
			<APath
				anim={spark3}
				d="M168,108 l1.5,4.5 -1.5,4.5 -1.5,-4.5z"
				fill={Y.mid}
			/>
			<ACircle anim={spark1} cx={33} cy={122} r={3} fill={Y.mid} />
			<ACircle anim={spark2} cx={168} cy={76} r={2.5} fill={Y.light} />
		</svg>
	);
}
