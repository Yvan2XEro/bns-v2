import {
	ACircle,
	AG,
	APath,
	ARect,
	floatG,
	pulse,
	waveOpacity,
	wiggle,
} from "../animated";

const B = {
	base: "#1e40af",
	mid: "#3b82f6",
	light: "#93c5fd",
	pale: "#dbeafe",
	dark: "#1e3a8a",
};
const Y = {
	base: "#d97706",
	mid: "#f59e0b",
	light: "#fbbf24",
	pale: "#fef3c7",
};

type Props = { color?: string; size?: number };

export default function NotFound({ color = B.base, size = 200 }: Props) {
	const cardFloat = floatG(8, 2600, 0);
	const lensGlow = pulse(0.05, 0.18, 2100, 120);
	const tagWiggle = wiggle(7, 1800, 300);
	const cardGlow = pulse(0.04, 0.12, 2500, 0);
	const spark1 = pulse(0.12, 0.8, 1300, 0);
	const spark2 = pulse(0.1, 0.65, 1650, 450);
	const lensShine = waveOpacity(0.15, 0.75, 1400, 120);

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
			<ellipse cx={100} cy={168} rx={56} ry={9} fill={B.dark} opacity={0.1} />
			<ACircle anim={cardGlow} cx={96} cy={92} r={68} fill={color} />

			<AG anim={cardFloat}>
				{/* Listing card */}
				<rect
					x={42}
					y={48}
					width={92}
					height={112}
					rx={14}
					fill="#fff"
					stroke={color}
					strokeWidth={2}
				/>
				{/* torn corner */}
				<path
					d="M116 48 L134 48 L134 66"
					fill={B.pale}
					stroke={color}
					strokeWidth={2}
				/>
				<path d="M116 48 L134 66 L116 66 Z" fill={B.pale} />

				{/* image area */}
				<rect x={52} y={60} width={72} height={42} rx={10} fill={B.pale} />
				<path
					d="M58 95 L75 80 L87 90 L99 76 L118 95 Z"
					fill={B.light}
					opacity={0.9}
				/>
				<circle cx={73} cy={74} r={5} fill={Y.light} />

				{/* content lines */}
				<rect
					x={52}
					y={114}
					width={48}
					height={8}
					rx={4}
					fill={color}
					opacity={0.14}
				/>
				<rect
					x={52}
					y={128}
					width={58}
					height={6}
					rx={3}
					fill={color}
					opacity={0.12}
				/>
				<rect
					x={52}
					y={140}
					width={42}
					height={6}
					rx={3}
					fill={color}
					opacity={0.1}
				/>

				{/* muted strike */}
				<line
					x1={48}
					y1={54}
					x2={128}
					y2={150}
					stroke={Y.mid}
					strokeWidth={4}
					strokeLinecap="round"
					opacity={0.35}
				/>
			</AG>

			{/* 404 tag */}
			<AG anim={tagWiggle} origin="146,64">
				<line
					x1={146}
					y1={46}
					x2={146}
					y2={56}
					stroke={B.dark}
					strokeWidth={2}
					strokeLinecap="round"
				/>
				<rect
					x={126}
					y={56}
					width={40}
					height={22}
					rx={11}
					fill={Y.mid}
					stroke={Y.base}
					strokeWidth={1.5}
				/>
				<path
					d="M139 63 h-3 v4 h3 v-4Zm0 7 h-3 v3 h3 v-3Zm6-7 h-3 v10 h3V63Zm6 0 h-3 v4 h3 v-4Zm0 7 h-3 v3 h3 v-3Z"
					fill="#fff"
				/>
			</AG>

			{/* magnifying glass */}
			<ACircle anim={lensGlow} cx={132} cy={122} r={30} fill={color} />
			<circle
				cx={132}
				cy={122}
				r={24}
				fill="rgba(255,255,255,0.9)"
				stroke={color}
				strokeWidth={3}
			/>
			<circle cx={132} cy={122} r={14} fill="rgba(219,234,254,0.8)" />
			<APath
				anim={lensShine}
				d="M123 112 Q129 106 138 110"
				stroke="#fff"
				strokeWidth={2.5}
				strokeLinecap="round"
			/>
			<line
				x1={148}
				y1={138}
				x2={162}
				y2={152}
				stroke={color}
				strokeWidth={5}
				strokeLinecap="round"
			/>

			{/* question / sparkles */}
			<path
				d="M71 26 c-9 0 -14 5 -14 11 h7 c0 -3 2 -5 7 -5 4 0 7 2 7 5 0 2 -1 4 -4 6 -5 3 -7 6 -7 11 v2 h7 v-2 c0 -3 1 -4 4 -6 5 -4 8 -7 8 -13 0 -6 -5 -9 -15 -9Zm-4 37 h8 v8 h-8z"
				fill={Y.mid}
				opacity={0.9}
			/>
			<ACircle anim={spark1} cx={34} cy={124} r={4} fill={color} />
			<ACircle anim={spark2} cx={168} cy={88} r={3} fill={Y.mid} />
			<ARect
				anim={spark1}
				x={156}
				y={40}
				width={4}
				height={12}
				rx={2}
				fill={color}
			/>
			<ARect
				anim={spark1}
				x={152}
				y={44}
				width={12}
				height={4}
				rx={2}
				fill={color}
			/>
		</svg>
	);
}
