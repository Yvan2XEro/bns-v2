import Svg, { Circle, ClipPath, G, Path } from "react-native-svg";
import {
	ACircle,
	AEllipse,
	AG,
	ALine,
	APath,
	useFlicker,
	useFloatG,
	useFloatShadow,
	usePulse,
} from "../animated";
import { IllustrationDefs, paintIds } from "../defs";
import { useIllustrationPalette } from "../palette";

const NS = "boost";
const paint = paintIds(NS);

const HULL = "M100,38 c0,0-32,30-32,66 h64 c0,-36-32,-66-32,-66z";

type Props = { color?: string; size?: number };

/**
 * A rocket, lit from the upper left.
 *
 * A cylinder under one lamp has a bright band left of centre and a long fall
 * into shade on the right — the single detail that stops this reading as a
 * flat paper cut-out. The flame lights the hull from below, so the underside
 * carries a warm bounce the lamp cannot explain.
 */
export default function Boost({ color, size = 200 }: Props) {
	const p = useIllustrationPalette();
	const accent = color ?? p.y.mid;

	const rocketFloat = useFloatG(11, 2200, 0);
	const ground = useFloatShadow({
		rx: 48,
		ry: 8,
		rise: 11,
		duration: 2200,
		opacity: 0.85,
	});
	const glow = usePulse(0.35, 0.8, 1800, 0);
	const flameOuter = useFlicker(0.7, 1, 0);
	const flameInner = useFlicker(0.5, 1, 80);
	const flameCore = useFlicker(0.6, 1, 150);
	const bounce = useFlicker(0.18, 0.4, 40);
	const exhaust1 = usePulse(0.3, 0.8, 500, 0);
	const exhaust2 = usePulse(0.2, 0.7, 500, 180);
	const exhaust3 = usePulse(0.15, 0.6, 500, 360);
	const star1 = usePulse(0.1, 0.9, 1000, 0);
	const star2 = usePulse(0.1, 0.8, 1300, 250);
	const star3 = usePulse(0.1, 0.75, 900, 500);
	const star4 = usePulse(0.08, 0.7, 1600, 750);
	const speed = usePulse(0.15, 0.5, 800, 0);

	return (
		<Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
			<IllustrationDefs ns={NS} p={p}>
				<ClipPath id={`${NS}-hull`}>
					<Path d={HULL} />
				</ClipPath>
			</IllustrationDefs>

			<AEllipse animatedProps={ground} cx={107} cy={170} fill={paint.ground} />

			<AG animatedProps={glow}>
				<Circle cx={100} cy={96} r={72} fill={paint.glow} opacity={0.45} />
			</AG>

			<AG animatedProps={rocketFloat}>
				{/* Hull. The gradient alone would read as a flat panel, so the
				    clipped bands below carve the cylinder. */}
				<Path d={HULL} fill={paint.lit} />
				<G clipPath={`url(#${NS}-hull)`}>
					{/* Right third turns away: shade, then weave in it. */}
					<Path
						d="M104,30 H140 V110 H104 Z"
						fill={paint.shade}
						opacity={0.42}
					/>
					<Path
						d="M104,30 H140 V110 H104 Z"
						fill={paint.weave}
						opacity={p.weave.strong}
					/>
					{/* The lit band, left of the centre line. */}
					<Path d="M74,30 H92 V110 H74 Z" fill={paint.spec} opacity={0.34} />
					{/* Terminator: the soft core shadow before the shade. */}
					<Path d="M96,30 H106 V110 H96 Z" fill={p.shadow} opacity={0.07} />
					{/* Warm bounce off the flame onto the underside. */}
					<AG animatedProps={bounce}>
						<Path d="M60,92 H140 V112 H60 Z" fill={p.y.mid} />
					</AG>
					{/* Signage stripe wrapping the nose. */}
					<Path
						d="M78,88 c6,-16 10,-28 22,-46 12,18 16,30 22,46z"
						fill={p.y.mid}
						opacity={0.3}
					/>
				</G>
				<Path
					d={HULL}
					fill="none"
					stroke={p.i.base}
					strokeWidth={1.4}
					opacity={0.55}
				/>
				{/* The nose's leading edge takes the hardest highlight. */}
				<Path
					d="M100,38 c-6,6-14,16-20,30"
					stroke={p.spec}
					strokeWidth={2}
					strokeLinecap="round"
					fill="none"
					opacity={0.85}
				/>

				{/* Cockpit: glass set into the hull, so it gets a rim, a dark
				    interior and a specular dot. */}
				<Circle cx={100} cy={80} r={12.5} fill={p.i.deep} opacity={0.5} />
				<Circle cx={100} cy={80} r={11} fill={paint.shade} />
				<Circle cx={100} cy={80} r={11} fill={p.i.deep} opacity={0.35} />
				<Path
					d="M91,74 a11,11 0 0 1 10,-5"
					stroke={p.spec}
					strokeWidth={2}
					strokeLinecap="round"
					fill="none"
					opacity={0.7}
				/>
				<Circle cx={96} cy={76} r={2.8} fill={p.spec} opacity={0.55} />
				<Circle
					cx={100}
					cy={80}
					r={12.5}
					fill="none"
					stroke={p.i.base}
					strokeWidth={1.6}
					opacity={0.6}
				/>

				{/* Fins, each a folded plate: lit face and shaded return. */}
				<Path d="M68,104 L52,126 L68,126 Z" fill={paint.tape} />
				<Path d="M68,104 L60,126 L68,126 Z" fill={p.y.deep} opacity={0.3} />
				<Path
					d="M68,104 L52,126"
					stroke={p.y.light}
					strokeWidth={1.4}
					strokeLinecap="round"
					opacity={0.8}
				/>
				<Path d="M132,104 L148,126 L132,126 Z" fill={p.y.base} />
				<Path d="M132,104 L140,126 L132,126 Z" fill={p.y.deep} opacity={0.4} />

				{/* Base ring and nozzle, both recessed. */}
				<Path d="M68,104 h64 v6 H68z" fill={paint.shade} />
				<Path d="M68,104 h64 v2 H68z" fill={p.spec} opacity={0.3} />
				<Path
					d="M80,110 L78,118 h44 L120,110z"
					fill={p.i.deep}
					opacity={0.75}
				/>
				<Path
					d="M80,110 L78,118"
					stroke={p.i.mid}
					strokeWidth={1}
					strokeLinecap="round"
					opacity={0.5}
				/>

				{/* Flame, hottest at the core. */}
				<APath
					animatedProps={flameOuter}
					d="M84,118 c0,0 4,26 16,36 12,-10 16,-36 16,-36 Z"
					fill={p.y.base}
				/>
				<APath
					animatedProps={flameInner}
					d="M88,118 c0,0 3,20 12,28 9,-8 12,-28 12,-28 Z"
					fill={p.y.mid}
				/>
				<APath
					animatedProps={flameCore}
					d="M93,118 c0,0 2,12 7,18 5,-6 7,-18 7,-18 Z"
					fill={p.y.light}
				/>
				<APath
					animatedProps={flameCore}
					d="M96,118 c0,0 1,7 4,11 3,-4 4,-11 4,-11 Z"
					fill={p.spec}
					opacity={0.9}
				/>

				<ACircle
					animatedProps={exhaust1}
					cx={94}
					cy={158}
					r={5}
					fill={p.y.light}
					opacity={0.5}
				/>
				<ACircle
					animatedProps={exhaust2}
					cx={100}
					cy={162}
					r={4}
					fill={p.y.mid}
					opacity={0.4}
				/>
				<ACircle
					animatedProps={exhaust3}
					cx={106}
					cy={157}
					r={3}
					fill={p.y.light}
					opacity={0.35}
				/>
			</AG>

			<ALine
				animatedProps={speed}
				x1={50}
				y1={78}
				x2={28}
				y2={74}
				stroke={p.y.mid}
				strokeWidth={2.5}
				strokeLinecap="round"
			/>
			<ALine
				animatedProps={speed}
				x1={48}
				y1={92}
				x2={22}
				y2={92}
				stroke={p.y.mid}
				strokeWidth={2}
				strokeLinecap="round"
				opacity={0.7}
			/>
			<ALine
				animatedProps={speed}
				x1={50}
				y1={106}
				x2={30}
				y2={110}
				stroke={p.y.mid}
				strokeWidth={1.5}
				strokeLinecap="round"
				opacity={0.5}
			/>
			<ALine
				animatedProps={speed}
				x1={150}
				y1={78}
				x2={172}
				y2={74}
				stroke={p.i.mid}
				strokeWidth={2.5}
				strokeLinecap="round"
			/>
			<ALine
				animatedProps={speed}
				x1={152}
				y1={92}
				x2={178}
				y2={92}
				stroke={p.i.mid}
				strokeWidth={2}
				strokeLinecap="round"
				opacity={0.7}
			/>
			<ALine
				animatedProps={speed}
				x1={150}
				y1={106}
				x2={170}
				y2={110}
				stroke={p.i.mid}
				strokeWidth={1.5}
				strokeLinecap="round"
				opacity={0.5}
			/>

			<APath animatedProps={star1} d="M38,52 l2,6 -2,6 -2,-6z" fill={p.y.mid} />
			<APath
				animatedProps={star2}
				d="M162,46 l2,6 -2,6 -2,-6z"
				fill={p.i.mid}
			/>
			<ACircle animatedProps={star3} cx={100} cy={34} r={3} fill={p.y.mid} />
			<ACircle animatedProps={star4} cx={168} cy={112} r={2.5} fill={accent} />
			<APath
				animatedProps={star1}
				d="M28,120 l1.5,4.5 -1.5,4.5 -1.5,-4.5z"
				fill={p.i.light}
			/>
		</Svg>
	);
}
