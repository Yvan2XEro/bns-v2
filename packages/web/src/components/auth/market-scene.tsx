import type { CSSProperties } from "react";

const NAVY = "#1E40AF";
const BLUE = "#3B82F6";
const SKY = "#DBEAFE";
const MIST = "#EFF6FF";
const AMBER = "#F59E0B";
const SAND = "#FEF3C7";

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

function Sparkle({
	x,
	y,
	s = 1,
	ms = 0,
}: {
	x: number;
	y: number;
	s?: number;
	ms?: number;
}) {
	return (
		<path
			className="auth-twinkle"
			style={delay(ms)}
			d={`M${x},${y - 6 * s} l${1.6 * s},${4.4 * s} ${4.4 * s},${1.6 * s} -${4.4 * s},${1.6 * s} -${1.6 * s},${4.4 * s} -${1.6 * s},-${4.4 * s} -${4.4 * s},-${1.6 * s} ${4.4 * s},-${1.6 * s}z`}
			fill={AMBER}
			opacity={0.7}
		/>
	);
}

function Dots({ x, y, fill }: { x: number; y: number; fill: string }) {
	return (
		<g fill={fill}>
			<circle cx={x} cy={y} r={3} />
			<circle cx={x + 11} cy={y} r={3} opacity={0.7} />
			<circle cx={x + 22} cy={y} r={3} opacity={0.4} />
		</g>
	);
}

const SCALLOPS = Array.from({ length: 6 }, (_, i) => 88 + i * (184 / 6));

/**
 * A market stall with parcels, a swinging price tag, chat bubbles and a
 * delivery pin: buying, selling and talking, drawn by hand.
 */
export function MarketScene({ className }: { className?: string }) {
	const w = 184 / 6;
	return (
		<svg
			className={className}
			aria-hidden="true"
			focusable="false"
			viewBox="0 0 360 290"
			fill="none"
		>
			<circle cx={180} cy={128} r={104} fill={MIST} />
			<ellipse cx={180} cy={240} rx={160} ry={14} fill={NAVY} opacity={0.06} />

			{/* Stall */}
			<rect
				x={100}
				y={100}
				width={8}
				height={136}
				rx={3}
				fill={NAVY}
				opacity={0.18}
			/>
			<rect
				x={252}
				y={100}
				width={8}
				height={136}
				rx={3}
				fill={NAVY}
				opacity={0.18}
			/>
			<path d="M88,92 L272,92 L260,66 L100,66 Z" fill={NAVY} />
			<path d="M100,66 L260,66 L256,58 L104,58 Z" fill="#1E3A8A" />
			{SCALLOPS.map((x, i) => (
				<path
					key={x}
					d={`M${x},92 h${w} v12 a${w / 2},${w / 2} 0 0 1 -${w},0 z`}
					fill={i % 2 === 0 ? NAVY : SAND}
				/>
			))}

			{/* Swinging price tag */}
			<g className="auth-sway">
				<path
					d="M232,108 v14"
					stroke={NAVY}
					strokeWidth={1.5}
					strokeLinecap="round"
				/>
				<rect x={221} y={121} width={22} height={28} rx={5} fill={AMBER} />
				<circle cx={232} cy={128} r={2.5} fill="#fff" />
				<path
					d="M226,138 h12 M226,143 h8"
					stroke="#fff"
					strokeWidth={2}
					strokeLinecap="round"
				/>
			</g>

			{/* Goods */}
			<g className="auth-float" style={delay(400)}>
				<rect x={116} y={144} width={32} height={26} rx={5} fill="#FCD34D" />
				<path d="M132,144 v26" stroke={AMBER} strokeWidth={3} />
			</g>
			<rect x={154} y={134} width={38} height={36} rx={6} fill="#93C5FD" />
			<path d="M154,146 h38" stroke={BLUE} strokeWidth={3} opacity={0.5} />
			<rect x={198} y={146} width={20} height={24} rx={4} fill={NAVY} />
			<rect x={201} y={150} width={14} height={14} rx={2} fill={SKY} />

			{/* Counter */}
			<rect
				x={90}
				y={170}
				width={180}
				height={66}
				rx={12}
				fill="#fff"
				stroke={SKY}
				strokeWidth={2}
			/>
			<rect x={90} y={170} width={180} height={12} rx={6} fill={MIST} />
			<path
				d="M118,206 h56 M118,218 h34"
				stroke={SKY}
				strokeWidth={5}
				strokeLinecap="round"
			/>
			<circle cx={238} cy={210} r={13} fill={SAND} />
			<path
				d="M232,210 l4,4 8,-8"
				stroke={AMBER}
				strokeWidth={2.5}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>

			{/* Parcels waiting to ship */}
			<g className="auth-float-slow">
				<rect
					x={18}
					y={192}
					width={58}
					height={44}
					rx={7}
					fill={SAND}
					stroke={AMBER}
					strokeWidth={2}
				/>
				<path
					d="M47,192 v44 M18,206 h58"
					stroke={AMBER}
					strokeWidth={2}
					opacity={0.6}
				/>
			</g>
			<g className="auth-float" style={delay(1200)}>
				<rect
					x={28}
					y={150}
					width={38}
					height={34}
					rx={6}
					fill={SKY}
					stroke={BLUE}
					strokeWidth={2}
				/>
				<path d="M47,150 v34" stroke={BLUE} strokeWidth={2} opacity={0.5} />
			</g>

			{/* Delivery route to a pin */}
			<path
				className="auth-route"
				d="M262,248 C284,264 302,262 318,246"
				stroke={AMBER}
				strokeWidth={2.5}
				strokeLinecap="round"
				strokeDasharray="5 9"
			/>
			<g className="auth-float" style={delay(800)}>
				<path
					d="M322,240 c-13,-14 -21,-24 -21,-34 a21,21 0 0 1 42,0 c0,10 -8,20 -21,34z"
					fill={NAVY}
				/>
				<circle cx={322} cy={206} r={8} fill="#fff" />
			</g>

			{/* Conversation */}
			<g className="auth-pop">
				<rect
					x={18}
					y={34}
					width={84}
					height={42}
					rx={18}
					fill="#fff"
					stroke={SKY}
					strokeWidth={2}
				/>
				<path
					d="M38,75 l-6,12 16,-11"
					fill="#fff"
					stroke={SKY}
					strokeWidth={2}
					strokeLinejoin="round"
				/>
				<Dots x={44} y={55} fill={BLUE} />
			</g>
			<g className="auth-pop" style={delay(3400)}>
				<rect x={262} y={28} width={78} height={40} rx={18} fill={NAVY} />
				<path d="M318,67 l8,11 -2,-12" fill={NAVY} />
				<path
					d="M290,48 l6,6 12,-12"
					stroke="#fff"
					strokeWidth={3}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</g>

			<Sparkle x={76} y={112} />
			<Sparkle x={300} y={118} s={0.8} ms={900} />
			<Sparkle x={180} y={30} s={0.9} ms={1700} />
		</svg>
	);
}

/** The small header motif used where the full scene does not fit. */
export function MarketMotif({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			aria-hidden="true"
			focusable="false"
			viewBox="0 0 120 72"
			fill="none"
		>
			<ellipse cx={56} cy={66} rx={34} ry={4} fill={NAVY} opacity={0.08} />
			<g className="auth-float">
				<rect
					x={30}
					y={26}
					width={44}
					height={36}
					rx={7}
					fill={SAND}
					stroke={AMBER}
					strokeWidth={2}
				/>
				<path
					d="M52,26 v36 M30,38 h44"
					stroke={AMBER}
					strokeWidth={2}
					opacity={0.6}
				/>
			</g>
			<g className="auth-pop" style={delay(600)}>
				<rect x={66} y={4} width={48} height={26} rx={12} fill={NAVY} />
				<path d="M74,29 l-4,8 10,-7" fill={NAVY} />
				<Dots x={79} y={17} fill="#fff" />
			</g>
			<Sparkle x={16} y={22} s={0.8} />
		</svg>
	);
}
