import {
	ACircle,
	AG,
	APath,
	floatY,
	orbit,
	pulse,
	scalePulse,
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

export default function Favorites({ color = B.base, size = 200 }: Props) {
	const heartScale = scalePulse(0.94, 1.06, 1800, 0);
	const glow1 = pulse(0.06, 0.2, 2400, 0);
	const glow2 = pulse(0.04, 0.12, 2800, 500);
	const orbit1 = orbit(4200, 0);
	const orbit2 = orbit(6000, 800, true);
	const float1 = floatY(148, 10, 2800, 0);
	const float2 = floatY(140, 8, 3200, 600);
	const spark1 = pulse(0.1, 0.85, 1200, 0);
	const spark2 = pulse(0.08, 0.7, 1500, 350);
	const spark3 = pulse(0.1, 0.75, 1800, 700);
	const shine = pulse(0.3, 0.8, 2000, 200);

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
			<ellipse cx={100} cy={164} rx={52} ry={8} fill={B.dark} opacity={0.1} />

			{/* Outer glow rings */}
			<ACircle anim={glow2} cx={100} cy={95} r={80} fill={color} />
			<ACircle anim={glow1} cx={100} cy={95} r={68} fill={color} />

			{/* Orbiting small blue heart */}
			<AG anim={orbit2} origin="100,95">
				<path
					d="M156,90 c-.4,0-9,-5.5-9,-11 a5,5 0 0 1 9,-2.5 5,5 0 0 1 9,2.5 c0,5.5-8.6,11-9,11z"
					fill={color}
					opacity={0.35}
				/>
			</AG>
			{/* Orbiting small orange heart */}
			<AG anim={orbit1} origin="100,95">
				<path
					d="M140,65 c-.3,0-7,-4.5-7,-9 a4,4 0 0 1 7,-2 4,4 0 0 1 7,2 c0,4.5-6.7,9-7,9z"
					fill={Y.mid}
					opacity={0.55}
				/>
			</AG>

			{/* Main heart */}
			<AG anim={heartScale} origin="100,100">
				{/* Shadow */}
				<path
					d="M100,140 c-2,0-54,-33-54,-64 a30,30 0 0 1 54,-15 30,30 0 0 1 54,15 c0,31-52,64-54,64z"
					fill={color}
					opacity={0.1}
				/>
				{/* Fill */}
				<path
					d="M100,134 c-1.5,0-44,-28-44,-54 a24,24 0 0 1 44,-12 24,24 0 0 1 44,12 c0,26-42.5,54-44,54z"
					fill={color}
					opacity={0.95}
				/>
				{/* Orange inner accent */}
				<path
					d="M100,122 c-1,0-28,-18-28,-35 a15,15 0 0 1 28,-7.5 15,15 0 0 1 28,7.5 c0,17-27,35-28,35z"
					fill={Y.base}
					opacity={0.2}
				/>
				{/* Shine */}
				<APath
					anim={shine}
					d="M76,82 a16,16 0 0 1 16,-16"
					stroke="#fff"
					strokeWidth={2.5}
					strokeLinecap="round"
				/>
				<circle cx={82} cy={88} r={5} fill="#fff" opacity={0.25} />
			</AG>

			{/* Floating dots */}
			<ACircle anim={float1} cx={100} r={3} fill={color} opacity={0.3} />
			<ACircle anim={float2} cx={86} r={2} fill={Y.mid} opacity={0.35} />

			{/* Sparkles */}
			<APath anim={spark1} d="M165,68 l2,6  -2,6  -2,-6z" fill={color} />
			<APath anim={spark3} d="M32,90  l2,5  -2,5  -2,-5z" fill={color} />
			<APath
				anim={spark2}
				d="M166,120 l1.5,4.5 -1.5,4.5 -1.5,-4.5z"
				fill={Y.mid}
			/>
			<ACircle anim={spark1} cx={36} cy={68} r={3.5} fill={Y.light} />
			<ACircle anim={spark2} cx={162} cy={142} r={2.5} fill={Y.mid} />
			<ACircle anim={spark3} cx={130} cy={48} r={2} fill={color} />
		</svg>
	);
}
