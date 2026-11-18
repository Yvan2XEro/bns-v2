import Svg, { ClipPath, Ellipse, G, Path, Rect } from "react-native-svg";
import {
	ACircle,
	AEllipse,
	AG,
	APath,
	useFloatG,
	useFloatShadow,
	useFloatY,
	usePulse,
	useWaveOpacity,
} from "../animated";
import { IllustrationDefs, paintIds } from "../defs";
import { useIllustrationPalette } from "../palette";

const NS = "empty";
const paint = paintIds(NS);

type Props = { color?: string; size?: number };

/**
 * An open carton with nothing in it, lit from the upper left.
 *
 * The weave of ndop cloth shows on the two faces turned away from the light
 * and nowhere else — on a lit face it would read as a printed motif instead
 * of as the grain of the surface.
 */
export default function Empty({ color, size = 200 }: Props) {
	const p = useIllustrationPalette();
	const accent = color ?? p.i.base;

	const lift = useFloatG(8, 2800);
	const ground = useFloatShadow({ rx: 65, ry: 12.5, rise: 8, duration: 2800 });
	const glow = usePulse(0.6, 1, 2600);
	const dust1 = useWaveOpacity(0.15, 0.7, 1100, 0);
	const dust2 = useWaveOpacity(0.1, 0.55, 1300, 320);
	const motes1 = useFloatY(80, 28, 2600, 0);
	const motes2 = useFloatY(74, 20, 3100, 450);
	const spark1 = usePulse(0.1, 0.72, 1300, 0);
	const spark2 = usePulse(0.08, 0.6, 1600, 420);

	return (
		<Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
			<IllustrationDefs ns={NS} p={p}>
				<ClipPath id={`${NS}-side`}>
					<Path d="M35,82 L55,100 L55,148 L35,130 Z" />
				</ClipPath>
				<ClipPath id={`${NS}-front`}>
					<Rect x={55} y={100} width={90} height={48} rx={2.5} />
				</ClipPath>
				<ClipPath id={`${NS}-flapFar`}>
					<Path d="M145,100 L165,82 L132,58 L112,76 Z" />
				</ClipPath>
			</IllustrationDefs>

			{/* Sits right of centre: the light comes from the left. */}
			<AEllipse animatedProps={ground} cx={107} cy={165} fill={paint.ground} />

			<AG animatedProps={lift}>
				{/* Inside: the far wall, the floor catching a little light, and
				    the warm spill that washes over the opening's edges. */}
				<Path d="M55,100 L88,76 L112,76 L145,100 Z" fill={p.i.deep} />
				<Path
					d="M70,96 L95,80 L118,80 L132,96 Z"
					fill={p.i.mid}
					opacity={0.3}
				/>
				<AG animatedProps={glow}>
					<Ellipse cx={100} cy={97} rx={44} ry={28} fill={paint.glow} />
				</AG>

				{/* Left side panel — in shade, so the weave reads here. */}
				<Path d="M35,82 L55,100 L55,148 L35,130 Z" fill={paint.shade} />
				<G clipPath={`url(#${NS}-side)`}>
					<Rect
						x={30}
						y={78}
						width={32}
						height={76}
						fill={paint.weave}
						opacity={p.weave.strong}
					/>
				</G>
				<Path
					d="M35,82 L55,100 L55,148 L35,130 Z"
					fill="none"
					stroke={p.edgeSoft}
					strokeWidth={0.9}
				/>

				{/* Front face — lit, so no weave. Occlusion under the lip, an
				    oblique sheen, and the corner the light never reaches. */}
				<Rect x={55} y={100} width={90} height={48} rx={2.5} fill={paint.lit} />
				<G clipPath={`url(#${NS}-front)`}>
					<Rect
						x={55}
						y={100}
						width={90}
						height={11}
						fill={p.shadow}
						opacity={0.15}
					/>
					<Path
						d="M55,148 L92,100 L112,100 L72,148 Z"
						fill={paint.spec}
						opacity={0.28}
					/>
					<Rect
						x={129}
						y={100}
						width={16}
						height={48}
						fill={p.shadow}
						opacity={0.09}
					/>
				</G>
				<Rect
					x={55}
					y={100}
					width={90}
					height={48}
					rx={2.5}
					fill="none"
					stroke={accent}
					strokeWidth={0.9}
					opacity={0.5}
				/>
				{/* The top arris catches the light. */}
				<Path
					d="M56.5,101 H143"
					stroke={p.spec}
					strokeWidth={1.2}
					opacity={0.75}
				/>

				{/* Tape, each strip with its own cast shadow. */}
				<Rect x={78} y={101} width={7} height={47} fill={paint.tape} />
				<Rect
					x={85}
					y={101}
					width={2}
					height={47}
					fill={p.shadow}
					opacity={0.14}
				/>
				<Rect x={55} y={119} width={90} height={5.5} fill={paint.tape} />
				<Rect
					x={55}
					y={124.5}
					width={90}
					height={2}
					fill={p.shadow}
					opacity={0.12}
				/>

				{/* Flaps: the near one folds toward the light, the far one away. */}
				<Path d="M55,100 L35,82 L68,58 L88,76 Z" fill={paint.flapNear} />
				<Path
					d="M55,100 L35,82 L68,58 L88,76 Z"
					fill="none"
					stroke={accent}
					strokeWidth={0.9}
					opacity={0.45}
				/>
				<Path d="M145,100 L165,82 L132,58 L112,76 Z" fill={paint.flapFar} />
				<G clipPath={`url(#${NS}-flapFar)`}>
					<Rect
						x={110}
						y={56}
						width={58}
						height={46}
						fill={paint.weave}
						opacity={p.weave.soft}
					/>
				</G>
				<Path
					d="M145,100 L165,82 L132,58 L112,76 Z"
					fill="none"
					stroke={accent}
					strokeWidth={0.9}
					opacity={0.45}
				/>

				{/* The cut edge of the board — 1.5px of thickness is the whole
				    difference between a carton and a flat shape. */}
				<Path
					d="M68,58 L88,76 L86.5,77.5 L66.5,59.5 Z"
					fill={p.spec}
					opacity={0.85}
				/>
				<Path
					d="M132,58 L112,76 L113.5,77.5 L133.5,59.5 Z"
					fill={p.i.light}
					opacity={0.7}
				/>

				{/* Dust lifting out of the opening. */}
				<ACircle animatedProps={dust1} cx={92} cy={70} r={2.6} fill={p.y.mid} />
				<ACircle
					animatedProps={dust2}
					cx={108}
					cy={63}
					r={1.8}
					fill={p.y.light}
				/>
			</AG>

			{/* Motes drifting up past the carton. */}
			<ACircle
				animatedProps={motes1}
				cx={95}
				r={3.5}
				fill={accent}
				opacity={0.25}
			/>
			<ACircle
				animatedProps={motes2}
				cx={118}
				r={2.4}
				fill={p.y.mid}
				opacity={0.3}
			/>

			{/* Sparks, kept to the corners the object leaves empty. */}
			<APath
				animatedProps={spark1}
				d="M166,54 l2,6 -2,6 -2,-6z"
				fill={p.y.mid}
			/>
			<ACircle animatedProps={spark2} cx={32} cy={124} r={2.8} fill={accent} />
		</Svg>
	);
}
