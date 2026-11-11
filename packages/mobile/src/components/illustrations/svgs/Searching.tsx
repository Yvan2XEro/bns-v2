import Svg, { Circle, ClipPath, G, Line, Path, Rect } from "react-native-svg";
import {
	ACircle,
	AEllipse,
	AG,
	APath,
	ARect,
	useFloatShadow,
	usePulse,
	useSweepX,
	useWaveOpacity,
} from "../animated";
import { IllustrationDefs, paintIds } from "../defs";
import { useIllustrationPalette } from "../palette";

const NS = "search";
const paint = paintIds(NS);

type Props = { color?: string; size?: number };

/**
 * A loupe passing over a stack of listings.
 *
 * The glass is the one place in the set where the weave shows through a lit
 * surface — because it is glass, and what reads through it is the paper
 * behind, not a motif on the lens.
 */
export default function Searching({ color, size = 200 }: Props) {
	const p = useIllustrationPalette();
	const accent = color ?? p.i.base;

	const loupe = useSweepX(18, 1600, 400);
	const ground = useFloatShadow({ rx: 56, ry: 9, rise: 4, duration: 1600 });
	const glow = usePulse(0.3, 0.75, 1800, 200);
	const highlight = usePulse(0.5, 1, 1400, 0);
	const spark1 = usePulse(0.1, 0.75, 1200, 0);
	const spark2 = usePulse(0.08, 0.6, 1500, 350);
	const spark3 = usePulse(0.1, 0.65, 1700, 700);
	const shine = useWaveOpacity(0.25, 0.8, 1400, 100);

	return (
		<Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
			<IllustrationDefs ns={NS} p={p}>
				<ClipPath id={`${NS}-sheet`}>
					<Rect x={50} y={45} width={82} height={100} rx={8} />
				</ClipPath>
				<ClipPath id={`${NS}-lens`}>
					<Circle cx={134} cy={108} r={25} />
				</ClipPath>
			</IllustrationDefs>

			<AEllipse animatedProps={ground} cx={107} cy={166} fill={paint.ground} />

			{/* The stack, each sheet casting on the one below. */}
			<Rect
				x={40}
				y={55}
				width={82}
				height={100}
				rx={8}
				fill={p.i.mid}
				opacity={0.3}
			/>
			<Rect
				x={45}
				y={50}
				width={82}
				height={100}
				rx={8}
				fill={p.i.light}
				opacity={0.5}
			/>

			{/* Front sheet — lit. */}
			<Rect x={50} y={45} width={82} height={100} rx={8} fill={paint.lit} />
			<G clipPath={`url(#${NS}-sheet)`}>
				{/* Occlusion along the left edge where the stack shades it. */}
				<Rect
					x={50}
					y={45}
					width={9}
					height={100}
					fill={p.shadow}
					opacity={0.08}
				/>
				{/* Oblique sheen across the paper. */}
				<Path
					d="M50,145 L96,45 L116,45 L70,145 Z"
					fill={paint.spec}
					opacity={0.3}
				/>
			</G>
			<Rect
				x={50}
				y={45}
				width={82}
				height={100}
				rx={8}
				fill="none"
				stroke={p.edge}
				strokeWidth={1}
				opacity={0.5}
			/>
			<Path d="M58,46 H124" stroke={p.spec} strokeWidth={1.2} opacity={0.7} />

			{/* Listing rows. */}
			<Rect
				x={63}
				y={60}
				width={52}
				height={5}
				rx={2.5}
				fill={p.i.light}
				opacity={0.75}
			/>
			<Rect
				x={63}
				y={72}
				width={44}
				height={4}
				rx={2}
				fill={p.i.light}
				opacity={0.6}
			/>
			<Rect
				x={63}
				y={82}
				width={58}
				height={4}
				rx={2}
				fill={p.i.light}
				opacity={0.6}
			/>
			<Rect
				x={63}
				y={92}
				width={38}
				height={4}
				rx={2}
				fill={p.i.light}
				opacity={0.6}
			/>
			<Rect
				x={63}
				y={102}
				width={50}
				height={4}
				rx={2}
				fill={p.i.light}
				opacity={0.6}
			/>

			{/* The hit — a signage-yellow row with its own cast shadow. */}
			<Rect
				x={58}
				y={126}
				width={68}
				height={2.5}
				fill={p.shadow}
				opacity={0.12}
			/>
			<ARect
				animatedProps={highlight}
				x={58}
				y={114}
				width={68}
				height={12}
				rx={4}
				fill={paint.tape}
			/>
			<Rect
				x={63}
				y={117}
				width={36}
				height={4}
				rx={2}
				fill={p.y.deep}
				opacity={0.5}
			/>

			<Rect
				x={63}
				y={130}
				width={24}
				height={9}
				rx={4.5}
				fill={accent}
				opacity={0.14}
			/>
			<Path
				d="M67,134.5 h16"
				stroke={accent}
				opacity={0.4}
				strokeWidth={1.5}
				strokeLinecap="round"
			/>

			<AG animatedProps={loupe}>
				{/* The pool of light the lens throws onto the page. */}
				<AG animatedProps={glow}>
					<Circle cx={134} cy={112} r={34} fill={paint.glow} opacity={0.5} />
				</AG>

				{/* The lens: glass, not a filled disc. The weave shows through
				    because it is the cloth behind it, seen through the glass. */}
				<Circle
					cx={134}
					cy={108}
					r={25}
					fill={p.i.pale}
					opacity={p.isDark ? 0.5 : 0.32}
				/>
				<G clipPath={`url(#${NS}-lens)`}>
					<Rect
						x={108}
						y={82}
						width={52}
						height={52}
						fill={paint.weave}
						opacity={p.weave.soft}
					/>
					{/* Glass picks up the lamp as a broad diagonal. */}
					<Path
						d="M109,133 L140,83 L156,83 L125,133 Z"
						fill={paint.spec}
						opacity={0.26}
					/>
					{/* And refracts a little warmth at the lower edge. */}
					<Circle cx={134} cy={126} r={14} fill={p.y.mid} opacity={0.14} />
				</G>

				{/* The rim: dark where it turns from the light, bright where
				    it faces it. */}
				<Circle
					cx={134}
					cy={108}
					r={26}
					fill="none"
					stroke={paint.shade}
					strokeWidth={4}
				/>
				<Path
					d="M116,90 a26,26 0 0 1 24,-7"
					stroke={p.spec}
					strokeWidth={2}
					strokeLinecap="round"
					fill="none"
					opacity={0.7}
				/>
				<Circle
					cx={134}
					cy={108}
					r={26}
					fill="none"
					stroke={p.edgeSoft}
					strokeWidth={0.8}
					opacity={0.5}
				/>

				<APath
					animatedProps={shine}
					d="M123,97 Q128,91 136,94"
					stroke={p.spec}
					strokeWidth={2.5}
					strokeLinecap="round"
					fill="none"
				/>
				<Circle cx={134} cy={108} r={4} fill={p.y.mid} opacity={0.5} />

				{/* Handle, with a lit side and a shaded one. */}
				<Line
					x1={153}
					y1={127}
					x2={170}
					y2={144}
					stroke={p.i.dark}
					strokeWidth={6}
					strokeLinecap="round"
				/>
				<Line
					x1={152}
					y1={126}
					x2={168}
					y2={142}
					stroke={p.i.mid}
					strokeWidth={2.5}
					strokeLinecap="round"
					opacity={0.9}
				/>
				<Line
					x1={151}
					y1={125}
					x2={165}
					y2={139}
					stroke={p.spec}
					strokeWidth={1}
					strokeLinecap="round"
					opacity={0.45}
				/>

				<ACircle
					animatedProps={spark1}
					cx={160}
					cy={88}
					r={3.5}
					fill={p.y.mid}
				/>
				<ACircle
					animatedProps={spark2}
					cx={114}
					cy={84}
					r={2.5}
					fill={accent}
				/>
				<APath
					animatedProps={spark3}
					d="M168,96 l1.5,4 -1.5,4 -1.5,-4z"
					fill={p.y.mid}
				/>
			</AG>

			<ACircle animatedProps={spark1} cx={36} cy={128} r={4} fill={accent} />
			<ACircle animatedProps={spark2} cx={164} cy={50} r={3} fill={p.y.light} />
			<APath
				animatedProps={spark3}
				d="M174,70 l2,5 -2,5 -2,-5z"
				fill={p.y.mid}
			/>
		</Svg>
	);
}
