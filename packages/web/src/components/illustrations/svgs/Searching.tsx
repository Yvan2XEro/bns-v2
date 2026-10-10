import {
	ACircle,
	AG,
	APath,
	ARect,
	pulse,
	sweepX,
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

export default function Searching({ color = B.base, size = 200 }: Props) {
	// Magnifying glass sweeps over cards
	const loupe = sweepX(18, 1600, 400);
	// Glow behind loupe
	const glowPulse = pulse(0.06, 0.2, 1800, 200);
	// Orange result highlight pulses
	const highlight = pulse(0.15, 0.55, 1400, 0);
	// Sparkles at lens
	const spark1 = pulse(0.1, 0.75, 1200, 0);
	const spark2 = pulse(0.08, 0.6, 1500, 350);
	const spark3 = pulse(0.1, 0.65, 1700, 700);
	// Shine in lens
	const shine = waveOpacity(0.2, 0.75, 1400, 100);
	// Card line shimmers
	const shimmer = pulse(0.3, 0.7, 2000, 0);

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
			<ellipse cx={100} cy={168} rx={55} ry={8} fill={B.dark} opacity={0.1} />
			{/* Background ambient */}
			<circle cx={90} cy={100} r={72} fill={color} opacity={0.04} />

			{/* Document stack — back */}
			<rect
				x={40}
				y={55}
				width={82}
				height={100}
				rx={8}
				fill="#E2E8F0"
				opacity={0.45}
			/>
			<rect
				x={45}
				y={50}
				width={82}
				height={100}
				rx={8}
				fill="#F1F5F9"
				opacity={0.8}
			/>
			{/* Document front */}
			<rect
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
			<rect x={63} y={60} width={52} height={5} rx={2.5} fill={B.pale} />
			<rect x={63} y={72} width={44} height={4} rx={2} fill={B.pale} />
			<rect x={63} y={82} width={58} height={4} rx={2} fill={B.pale} />
			<rect x={63} y={92} width={38} height={4} rx={2} fill={B.pale} />
			<rect x={63} y={102} width={50} height={4} rx={2} fill={B.pale} />

			{/* Orange highlighted result row */}
			<ARect
				anim={highlight}
				x={58}
				y={114}
				width={68}
				height={12}
				rx={4}
				fill={Y.mid}
			/>
			<rect
				x={63}
				y={117}
				width={36}
				height={4}
				rx={2}
				fill={Y.base}
				opacity={0.6}
			/>

			{/* Price tag on doc */}
			<rect
				x={63}
				y={130}
				width={24}
				height={9}
				rx={4.5}
				fill={color}
				opacity={0.15}
			/>
			<path
				d="M67,134.5 h16"
				stroke={color}
				opacity={0.4}
				strokeWidth={1.5}
				strokeLinecap="round"
			/>

			{/* Magnifying glass (sweeping) */}
			<AG anim={loupe}>
				{/* Glow behind glass */}
				<ACircle anim={glowPulse} cx={134} cy={108} r={34} fill={color} />
				{/* Glass ring */}
				<circle
					cx={134}
					cy={108}
					r={26}
					fill="rgba(219,234,254,0.92)"
					stroke={color}
					strokeWidth={3}
				/>
				{/* Lens inner circle */}
				<circle
					cx={134}
					cy={108}
					r={18}
					fill="rgba(255,255,255,0.6)"
					stroke={B.light}
					strokeWidth={1}
				/>
				{/* Lens shine */}
				<APath
					anim={shine}
					d="M123,97 Q128,91 136,94"
					stroke="#fff"
					strokeWidth={2.5}
					strokeLinecap="round"
				/>
				{/* Orange cross-hair center */}
				<circle cx={134} cy={108} r={4} fill={Y.mid} opacity={0.55} />
				{/* Handle */}
				<line
					x1={153}
					y1={127}
					x2={170}
					y2={144}
					stroke={color}
					strokeWidth={5}
					strokeLinecap="round"
				/>
				{/* Handle grip lines */}
				<line
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
				<ACircle anim={spark1} cx={160} cy={88} r={3.5} fill={Y.mid} />
				<ACircle anim={spark2} cx={114} cy={84} r={2.5} fill={color} />
				<APath anim={spark3} d="M168,96 l1.5,4 -1.5,4 -1.5,-4z" fill={Y.mid} />
			</AG>

			{/* Card shimmer line */}
			<ARect
				anim={shimmer}
				x={63}
				y={62}
				width={52}
				height={5}
				rx={2.5}
				fill={color}
				opacity={0.3}
			/>

			{/* Ambient sparkles */}
			<ACircle anim={spark1} cx={36} cy={128} r={4} fill={color} />
			<ACircle anim={spark2} cx={164} cy={50} r={3} fill={Y.light} />
			<APath anim={spark3} d="M174,70 l2,5 -2,5 -2,-5z" fill={Y.mid} />
		</svg>
	);
}
