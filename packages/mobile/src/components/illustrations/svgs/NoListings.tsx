import Svg, { Circle, Ellipse, Line, Path, Rect } from "react-native-svg";
import {
	ACircle,
	AG,
	APath,
	ARect,
	useFloatY,
	usePulse,
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

export default function NoListings({ color = B.base, size = 200 }: Props) {
	// Background glow
	const glow = usePulse(0.04, 0.14, 2400, 0);
	// Sign sways
	const sign = useWiggle(6, 2200, 0);
	// Window light flickers (closed shop)
	const winLight = useWaveOpacity(0.05, 0.22, 1800, 0);
	const winLight2 = useWaveOpacity(0.05, 0.18, 2000, 600);
	// Tumbleweed rolls
	const tumb1 = useFloatY(148, 6, 2000, 0);
	const tumb2 = useFloatY(152, 4, 2600, 800);
	// Sparkles
	const spark1 = usePulse(0.1, 0.75, 1300, 0);
	const spark2 = usePulse(0.08, 0.65, 1600, 450);
	const spark3 = usePulse(0.1, 0.7, 1900, 800);
	// Closed sign subtle pulse
	const signGlow = usePulse(0.6, 1, 2000, 0);

	return (
		<Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
			<Ellipse cx={100} cy={164} rx={64} ry={9} fill={B.dark} opacity={0.1} />
			<ACircle animatedProps={glow} cx={100} cy={96} r={72} fill={color} />

			{/* Building body */}
			<Rect
				x={30}
				y={82}
				width={140}
				height={82}
				rx={4}
				fill={B.pale}
				stroke={color}
				strokeWidth={2}
			/>
			{/* Building left 3D edge */}
			<Path
				d="M18,70 L30,82 L30,164 L18,152 Z"
				fill={B.mid}
				opacity={0.18}
				stroke={color}
				strokeWidth={1.5}
			/>

			{/* Roof / gable */}
			<Path d="M18,84 L100,42 L182,84 Z" fill={color} />
			<Rect x={90} y={38} width={20} height={9} rx={4.5} fill={B.dark} />

			{/* Orange awning with stripes */}
			<Path
				d="M26,90 Q55,108 84,90 Q113,108 142,90 Q171,108 178,90 L178,82 L26,82 Z"
				fill={Y.base}
			/>
			{[46, 100, 154].map((cx, i) => (
				<Path
					key={i}
					d={`M${cx - 9},82 Q${cx},98 ${cx + 9},82 Z`}
					fill="rgba(255,255,255,0.28)"
				/>
			))}

			{/* Left window (shutters closed) */}
			<Rect
				x={38}
				y={98}
				width={52}
				height={44}
				rx={4}
				fill={B.pale}
				stroke={color}
				strokeWidth={1.5}
			/>
			{/* Shutter slats */}
			{[102, 110, 118, 126, 134].map((y) => (
				<Rect
					key={y}
					x={40}
					y={y}
					width={48}
					height={4}
					rx={1}
					fill={color}
					opacity={0.1}
				/>
			))}
			<Line
				x1={64}
				y1={98}
				x2={64}
				y2={142}
				stroke={color}
				strokeWidth={1.5}
				opacity={0.35}
			/>
			{/* Window glow (faint light through shutter) */}
			<ARect
				animatedProps={winLight}
				x={40}
				y={100}
				width={22}
				height={40}
				rx={2}
				fill={Y.mid}
			/>
			<ARect
				animatedProps={winLight2}
				x={64}
				y={100}
				width={22}
				height={40}
				rx={2}
				fill={Y.mid}
			/>
			{/* Window sill */}
			<Rect
				x={34}
				y={142}
				width={60}
				height={5}
				rx={2.5}
				fill={color}
				opacity={0.4}
			/>

			{/* Right window */}
			<Rect
				x={110}
				y={98}
				width={52}
				height={44}
				rx={4}
				fill={B.pale}
				stroke={color}
				strokeWidth={1.5}
			/>
			{[102, 110, 118, 126, 134].map((y) => (
				<Rect
					key={y}
					x={112}
					y={y}
					width={48}
					height={4}
					rx={1}
					fill={color}
					opacity={0.1}
				/>
			))}
			<Line
				x1={136}
				y1={98}
				x2={136}
				y2={142}
				stroke={color}
				strokeWidth={1.5}
				opacity={0.35}
			/>
			<ARect
				animatedProps={winLight2}
				x={112}
				y={100}
				width={22}
				height={40}
				rx={2}
				fill={Y.mid}
			/>
			<ARect
				animatedProps={winLight}
				x={136}
				y={100}
				width={22}
				height={40}
				rx={2}
				fill={Y.mid}
			/>
			<Rect
				x={106}
				y={142}
				width={60}
				height={5}
				rx={2.5}
				fill={color}
				opacity={0.4}
			/>

			{/* Door (arched, closed) */}
			<Path
				d="M84,164 L84,130 A16,16 0 0 1 116,130 L116,164 Z"
				fill={color}
				opacity={0.85}
			/>
			<Path
				d="M82,164 L82,130 A18,18 0 0 1 118,130 L118,164"
				fill="none"
				stroke={B.dark}
				strokeWidth={1.5}
			/>
			{/* Door panels */}
			<Rect
				x={86}
				y={134}
				width={11}
				height={16}
				rx={2}
				fill={B.dark}
				opacity={0.35}
			/>
			<Rect
				x={103}
				y={134}
				width={11}
				height={16}
				rx={2}
				fill={B.dark}
				opacity={0.35}
			/>
			{/* Doorknob */}
			<Circle cx={100} cy={150} r={3} fill={Y.mid} />
			{/* Door step */}
			<Rect
				x={74}
				y={162}
				width={52}
				height={6}
				rx={2.5}
				fill={color}
				opacity={0.35}
			/>

			{/* Hanging "FERMÉ" sign (wiggling) */}
			<AG animatedProps={sign} origin="100,82">
				<Line
					x1={100}
					y1={82}
					x2={100}
					y2={90}
					stroke={B.dark}
					strokeWidth={2}
				/>
				<ARect
					animatedProps={signGlow}
					x={72}
					y={90}
					width={56}
					height={24}
					rx={6}
					fill={Y.base}
				/>
				<Rect
					x={72}
					y={90}
					width={56}
					height={24}
					rx={6}
					fill="none"
					stroke={Y.mid}
					strokeWidth={1.5}
				/>
				<Rect
					x={78}
					y={96}
					width={20}
					height={4}
					rx={2}
					fill="#fff"
					opacity={0.8}
				/>
				<Rect
					x={100}
					y={96}
					width={10}
					height={4}
					rx={2}
					fill="#fff"
					opacity={0.6}
				/>
				<Rect
					x={78}
					y={104}
					width={32}
					height={3}
					rx={1.5}
					fill="#fff"
					opacity={0.5}
				/>
			</AG>

			{/* Tumbleweed 1 */}
			<ACircle
				animatedProps={tumb1}
				cx={22}
				r={9}
				fill="none"
				stroke={Y.mid}
				strokeWidth={2}
				opacity={0.5}
			/>
			<Circle cx={22} cy={148} r={5} fill={Y.mid} opacity={0.2} />
			{/* Tumbleweed 2 */}
			<ACircle
				animatedProps={tumb2}
				cx={178}
				r={7}
				fill="none"
				stroke={Y.light}
				strokeWidth={1.5}
				opacity={0.45}
			/>

			{/* Sparkles */}
			<APath
				animatedProps={spark1}
				d="M22,56  l2,6   -2,6   -2,-6z"
				fill={color}
			/>
			<APath
				animatedProps={spark2}
				d="M178,62 l1.5,5 -1.5,5 -1.5,-5z"
				fill={Y.mid}
			/>
			<ACircle animatedProps={spark3} cx={162} cy={104} r={3} fill={Y.light} />
			<ACircle animatedProps={spark1} cx={38} cy={168} r={2.5} fill={color} />
		</Svg>
	);
}
