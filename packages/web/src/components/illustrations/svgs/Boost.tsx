import { ACircle, AG, ALine, APath, flicker, floatG, pulse } from "../animated";

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

// Boost defaults to orange (rocket / energy theme)
export default function Boost({ color = Y.mid, size = 200 }: Props) {
	// Rocket floats up/down
	const rocketFloat = floatG(11, 2200, 0);
	// Outer energy glow
	const glow = pulse(0.05, 0.18, 1800, 0);
	// Flame flicker (inner, outer)
	const flameOuter = flicker(0.7, 1, 0);
	const flameInner = flicker(0.5, 1, 80);
	const flameCore = flicker(0.6, 1, 150);
	// Exhaust particles
	const exhaust1 = pulse(0.3, 0.8, 500, 0);
	const exhaust2 = pulse(0.2, 0.7, 500, 180);
	const exhaust3 = pulse(0.15, 0.6, 500, 360);
	// Stars twinkling at different paces
	const star1 = pulse(0.1, 0.9, 1000, 0);
	const star2 = pulse(0.1, 0.8, 1300, 250);
	const star3 = pulse(0.1, 0.75, 900, 500);
	const star4 = pulse(0.08, 0.7, 1600, 750);
	// Speed lines
	const speed = pulse(0.15, 0.5, 800, 0);

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
			<ellipse cx={100} cy={170} rx={50} ry={8} fill={B.dark} opacity={0.1} />

			{/* Outer energy glow */}
			<ACircle anim={glow} cx={100} cy={90} r={72} fill={color} />

			{/* Floating rocket group */}
			<AG anim={rocketFloat}>
				{/* Rocket body */}
				<path
					d="M100,38 c0,0-32,30-32,66 h64 c0,-36-32,-66-32,-66z"
					fill="#fff"
					stroke={B.base}
					strokeWidth={2.5}
				/>
				{/* Blue nose / tip */}
				<path
					d="M100,38 c-8,14-18,30-22,52 h44 c-4,-22-14,-38-22,-52z"
					fill={B.pale}
				/>
				{/* Orange center stripe */}
				<path
					d="M78,88 c6,-16 10,-28 22,-46 12,18 16,30 22,46z"
					fill={Y.mid}
					opacity={0.18}
				/>
				{/* Cockpit window */}
				<circle
					cx={100}
					cy={80}
					r={12}
					fill={B.pale}
					stroke={B.base}
					strokeWidth={2}
				/>
				<circle cx={100} cy={80} r={7} fill={B.mid} opacity={0.5} />
				<circle cx={98} cy={78} r={2.5} fill="#fff" opacity={0.6} />
				{/* Left fin */}
				<path
					d="M68,104 L52,126 L68,126 Z"
					fill={Y.base}
					opacity={0.45}
					stroke={Y.mid}
					strokeWidth={1.5}
				/>
				{/* Right fin */}
				<path
					d="M132,104 L148,126 L132,126 Z"
					fill={Y.base}
					opacity={0.45}
					stroke={Y.mid}
					strokeWidth={1.5}
				/>
				{/* Bottom base */}
				<path
					d="M68,104 h64 v6 H68z"
					fill={B.pale}
					stroke={B.light}
					strokeWidth={1}
				/>
				{/* Exhaust nozzle */}
				<path d="M80,110 L78,118 h44 L120,110z" fill={B.mid} opacity={0.4} />

				{/* Outer flame */}
				<APath
					anim={flameOuter}
					d="M84,118 c0,0 4,26 16,36 12,-10 16,-36 16,-36 Z"
					fill={Y.base}
				/>
				{/* Mid flame */}
				<APath
					anim={flameInner}
					d="M88,118 c0,0 3,20 12,28 9,-8 12,-28 12,-28 Z"
					fill={Y.mid}
				/>
				{/* Core flame */}
				<APath
					anim={flameCore}
					d="M93,118 c0,0 2,12 7,18 5,-6 7,-18 7,-18 Z"
					fill="#fff"
					opacity={0.85}
				/>

				{/* Exhaust smoke particles */}
				<ACircle
					anim={exhaust1}
					cx={94}
					cy={158}
					r={5}
					fill={Y.light}
					opacity={0.5}
				/>
				<ACircle
					anim={exhaust2}
					cx={100}
					cy={162}
					r={4}
					fill={Y.mid}
					opacity={0.4}
				/>
				<ACircle
					anim={exhaust3}
					cx={106}
					cy={157}
					r={3}
					fill={Y.light}
					opacity={0.35}
				/>
			</AG>

			{/* Speed lines (left & right) */}
			<ALine
				anim={speed}
				x1={50}
				y1={78}
				x2={28}
				y2={74}
				stroke={Y.mid}
				strokeWidth={2.5}
				strokeLinecap="round"
			/>
			<ALine
				anim={speed}
				x1={48}
				y1={92}
				x2={22}
				y2={92}
				stroke={Y.mid}
				strokeWidth={2}
				strokeLinecap="round"
				opacity={0.7}
			/>
			<ALine
				anim={speed}
				x1={50}
				y1={106}
				x2={30}
				y2={110}
				stroke={Y.mid}
				strokeWidth={1.5}
				strokeLinecap="round"
				opacity={0.5}
			/>
			<ALine
				anim={speed}
				x1={150}
				y1={78}
				x2={172}
				y2={74}
				stroke={B.mid}
				strokeWidth={2.5}
				strokeLinecap="round"
			/>
			<ALine
				anim={speed}
				x1={152}
				y1={92}
				x2={178}
				y2={92}
				stroke={B.mid}
				strokeWidth={2}
				strokeLinecap="round"
				opacity={0.7}
			/>
			<ALine
				anim={speed}
				x1={150}
				y1={106}
				x2={170}
				y2={110}
				stroke={B.mid}
				strokeWidth={1.5}
				strokeLinecap="round"
				opacity={0.5}
			/>

			{/* Stars */}
			<APath anim={star1} d="M38,52  l2,6   -2,6   -2,-6z" fill={Y.mid} />
			<APath anim={star2} d="M162,46 l2,6   -2,6   -2,-6z" fill={B.mid} />
			<ACircle anim={star3} cx={100} cy={34} r={3} fill={Y.mid} />
			<ACircle anim={star4} cx={168} cy={112} r={2.5} fill={color} />
			<APath
				anim={star1}
				d="M28,120 l1.5,4.5 -1.5,4.5 -1.5,-4.5z"
				fill={B.light}
			/>
		</svg>
	);
}
