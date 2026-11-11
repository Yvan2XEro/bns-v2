import Svg, { Circle, ClipPath, G, Path, Rect } from "react-native-svg";
import {
	ACircle,
	AEllipse,
	AG,
	APath,
	useFloatShadow,
	usePulse,
	usePulseR,
	useScalePulse,
	useWaveOpacity,
	useWiggle,
} from "../animated";
import { IllustrationDefs, paintIds } from "../defs";
import { useIllustrationPalette } from "../palette";

const NS = "auth";
const paint = paintIds(NS);

const SHIELD =
	"M100,146 c-30,-8-50,-28-50,-52 V60 l50,-20 50,20 v34 c0,24-20,44-50,52z";

type Props = { color?: string; size?: number };

/**
 * A shield with a padlock, lit from the upper left.
 *
 * The shield is metal rather than paper: a hard specular edge along the top
 * left, a long fall into shade on the right, and the ndop weave chased into
 * that shaded half the way a crest is etched into a plate.
 */
export default function Auth({ color, size = 200 }: Props) {
	const p = useIllustrationPalette();
	const accent = color ?? p.i.base;

	const ring1 = usePulseR(58, 80, 2200, 0);
	const ring2 = usePulseR(46, 68, 2200, 600);
	const ring3 = usePulseR(34, 56, 2200, 1200);
	const breathe = useScalePulse(0.97, 1.03, 2000, 0);
	const ground = useFloatShadow({ rx: 50, ry: 8.5, rise: 4, duration: 2000 });
	const lock = useWiggle(4, 2400, 800);
	const keyhole = useWaveOpacity(0.5, 1, 1800, 300);
	const shackle = usePulse(0.6, 1, 1600, 0);
	const spark1 = usePulse(0.1, 0.8, 1300, 0);
	const spark2 = usePulse(0.08, 0.65, 1600, 450);
	const spark3 = usePulse(0.1, 0.7, 1900, 850);

	return (
		<Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
			<IllustrationDefs ns={NS} p={p}>
				<ClipPath id={`${NS}-shield`}>
					<Path d={SHIELD} />
				</ClipPath>
			</IllustrationDefs>

			<AEllipse animatedProps={ground} cx={106} cy={162} fill={paint.ground} />

			<ACircle
				animatedProps={ring1}
				cx={100}
				cy={96}
				fill="none"
				stroke={accent}
				strokeWidth={1.5}
				opacity={0.16}
			/>
			<ACircle
				animatedProps={ring2}
				cx={100}
				cy={96}
				fill="none"
				stroke={p.y.mid}
				strokeWidth={1}
				opacity={0.14}
			/>
			<ACircle
				animatedProps={ring3}
				cx={100}
				cy={96}
				fill="none"
				stroke={accent}
				strokeWidth={0.8}
				opacity={0.1}
			/>

			<AG animatedProps={breathe} origin="100,96">
				<G translateX={4} translateY={6}>
					<Path d={SHIELD} fill={p.shadow} opacity={0.12} />
				</G>

				{/* The plate. Lit across its upper-left face. */}
				<Path d={SHIELD} fill={paint.lit} />

				<G clipPath={`url(#${NS}-shield)`}>
					{/* The right half turns away — weave lives here. */}
					<Path d="M100,34 H156 V152 H100 Z" fill={paint.shade} opacity={0.5} />
					<Path
						d="M100,34 H156 V152 H100 Z"
						fill={paint.weave}
						opacity={p.weave.strong}
					/>
					{/* Hard specular sweep across the metal. */}
					<Path
						d="M46,130 L96,34 L116,34 L66,152 Z"
						fill={paint.spec}
						opacity={0.34}
					/>
					{/* The tip gathers the deepest shade. */}
					<Path d="M60,120 H142 V152 H60 Z" fill={p.i.deep} opacity={0.18} />
					{/* Signage band across the waist. */}
					<Path
						d="M48,80 L152,80 L150,96 a52,52 0 0 1-100,0 Z"
						fill={p.y.mid}
						opacity={0.18}
					/>
				</G>

				{/* Bevelled rim: bright where it faces the lamp, dark opposite. */}
				<Path
					d="M100,40 L50,60 V94 c0,10 3.5,19 9,27"
					stroke={p.spec}
					strokeWidth={2}
					strokeLinecap="round"
					fill="none"
					opacity={0.8}
				/>
				<Path
					d="M100,40 L150,60 v34 c0,24-20,44-50,52"
					stroke={p.edgeSoft}
					strokeWidth={1.6}
					strokeLinecap="round"
					fill="none"
					opacity={0.45}
				/>
				<Path
					d={SHIELD}
					fill="none"
					stroke={accent}
					strokeWidth={1.4}
					opacity={0.45}
				/>

				{/* Crest, struck into the plate: a dark cut with a lit lip. */}
				<Path
					d="M100,70 l3,8 8,0 -6.5,5 2.5,8 -7,-5 -7,5 2.5,-8 -6.5,-5 8,0z"
					fill={p.i.deep}
					opacity={0.3}
				/>
				<Path
					d="M100,69 l3,8 8,0 -6.5,5 2.5,8 -7,-5 -7,5 2.5,-8 -6.5,-5 8,0z"
					fill={p.spec}
					opacity={0.3}
				/>
			</AG>

			<AG animatedProps={lock} origin="100,110">
				{/* Shackle, behind the body: a bent bar with a lit top. */}
				<APath
					animatedProps={shackle}
					d="M88,96 V84 a12,12 0 0 1 24,0 V96"
					stroke={p.y.base}
					strokeWidth={5}
					strokeLinecap="round"
					fill="none"
				/>
				<Path
					d="M89,94 V84 a11,11 0 0 1 10,-11"
					stroke={p.y.light}
					strokeWidth={1.6}
					strokeLinecap="round"
					fill="none"
					opacity={0.8}
				/>

				{/* Body, with its own cast shadow on the shield. */}
				<G translateX={3} translateY={4}>
					<Rect
						x={82}
						y={96}
						width={36}
						height={28}
						rx={6}
						fill={p.shadow}
						opacity={0.16}
					/>
				</G>
				<Rect x={82} y={96} width={36} height={28} rx={6} fill={paint.tape} />
				<Rect
					x={82}
					y={96}
					width={9}
					height={28}
					rx={6}
					fill={p.spec}
					opacity={0.2}
				/>
				<Rect
					x={110}
					y={96}
					width={8}
					height={28}
					fill={p.y.deep}
					opacity={0.2}
				/>
				<Path
					d="M84,97.5 H116"
					stroke={p.spec}
					strokeWidth={1.2}
					strokeLinecap="round"
					opacity={0.6}
				/>

				{/* Keyhole: cut in, so the dark goes first and the lip catches. */}
				<APath
					animatedProps={keyhole}
					d="M100,104 a5,5 0 1 0 0.01,0 M100,109 v6"
					stroke={p.y.deep}
					strokeWidth={3}
					strokeLinecap="round"
					fill="none"
				/>
				<Path
					d="M100,103 a5,5 0 0 0 -4.6,3"
					stroke={p.spec}
					strokeWidth={1}
					strokeLinecap="round"
					fill="none"
					opacity={0.5}
				/>
			</AG>

			<APath animatedProps={spark1} d="M36,72 l2,6 -2,6 -2,-6z" fill={accent} />
			<ACircle animatedProps={spark2} cx={166} cy={68} r={3.5} fill={accent} />
			<APath
				animatedProps={spark3}
				d="M162,120 l1.5,4.5 -1.5,4.5 -1.5,-4.5z"
				fill={p.y.mid}
			/>
			<ACircle
				animatedProps={spark1}
				cx={40}
				cy={116}
				r={2.5}
				fill={p.y.light}
			/>
			<Circle cx={155} cy={52} r={3} fill={p.y.mid} opacity={0.45} />
			<Circle cx={45} cy={52} r={3} fill={p.i.light} opacity={0.5} />
		</Svg>
	);
}
