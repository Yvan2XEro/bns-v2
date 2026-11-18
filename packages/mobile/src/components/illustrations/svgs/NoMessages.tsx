import Svg, { Circle, ClipPath, G, Line, Path, Rect } from "react-native-svg";
import {
	ACircle,
	AEllipse,
	AG,
	APath,
	useFloatG,
	useFloatShadow,
	usePulse,
	useWaveOpacity,
} from "../animated";
import { IllustrationDefs, paintIds } from "../defs";
import { useIllustrationPalette } from "../palette";

const NS = "msg";
const paint = paintIds(NS);

const BIG_BUBBLE =
	"M28,70 h108a16,16 0 0 1 16,16 v46a16,16 0 0 1-16,16 H74L55,166 V148H28a16,16 0 0 1-16,-16 V86a16,16 0 0 1 16,-16z";
const SMALL_BUBBLE =
	"M115,40 h50a12,12 0 0 1 12,12 v30a12,12 0 0 1-12,12 h-14l-10,12 V94 h-26a12,12 0 0 1-12,-12 V52a12,12 0 0 1 12,-12z";

type Props = { color?: string; size?: number };

/**
 * Two bubbles waiting on a conversation that hasn't started.
 *
 * The far bubble sits behind and above, so it takes the shaded treatment and
 * carries the weave; the near one is lit and stays clean.
 */
export default function NoMessages({ color, size = 200 }: Props) {
	const p = useIllustrationPalette();
	const accent = color ?? p.i.base;

	const ground = useFloatShadow({ rx: 56, ry: 9, rise: 4, duration: 2200 });
	const dot1 = useWaveOpacity(0.2, 1, 600, 0);
	const dot2 = useWaveOpacity(0.2, 1, 600, 200);
	const dot3 = useWaveOpacity(0.2, 1, 600, 400);
	const planeFloat = useFloatG(6, 2200, 0);
	const glow = usePulse(0.35, 0.8, 2600, 300);
	const spark1 = usePulse(0.1, 0.75, 1300, 0);
	const spark2 = usePulse(0.08, 0.6, 1600, 450);
	const spark3 = usePulse(0.1, 0.7, 1900, 800);

	return (
		<Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
			<IllustrationDefs ns={NS} p={p}>
				<ClipPath id={`${NS}-big`}>
					<Path d={BIG_BUBBLE} />
				</ClipPath>
				<ClipPath id={`${NS}-small`}>
					<Path d={SMALL_BUBBLE} />
				</ClipPath>
			</IllustrationDefs>

			<AEllipse animatedProps={ground} cx={62} cy={172} fill={paint.ground} />

			<AG animatedProps={glow}>
				<Circle cx={140} cy={64} r={52} fill={paint.glow} opacity={0.45} />
			</AG>

			{/* Far bubble — set back, in shade, weave-bearing. */}
			<G translateX={4} translateY={5}>
				<Path d={SMALL_BUBBLE} fill={p.shadow} opacity={0.12} />
			</G>
			<Path d={SMALL_BUBBLE} fill={paint.shade} />
			<G clipPath={`url(#${NS}-small)`}>
				<Rect
					x={100}
					y={36}
					width={82}
					height={74}
					fill={paint.weave}
					opacity={p.weave.strong}
				/>
				<Path
					d="M103,106 L146,36 L166,36 L123,106 Z"
					fill={paint.spec}
					opacity={0.12}
				/>
			</G>
			<Path
				d={SMALL_BUBBLE}
				fill="none"
				stroke={p.edgeSoft}
				strokeWidth={1}
				opacity={0.6}
			/>
			<Path d="M117,41 H164" stroke={p.spec} strokeWidth={1.2} opacity={0.35} />

			{/* Its message rows, in signage yellow so the far bubble still
			    reads as the other person's side. */}
			<Rect
				x={124}
				y={58}
				width={38}
				height={4}
				rx={2}
				fill={p.y.mid}
				opacity={0.75}
			/>
			<Rect
				x={124}
				y={68}
				width={28}
				height={4}
				rx={2}
				fill={p.y.mid}
				opacity={0.5}
			/>
			<Rect
				x={124}
				y={78}
				width={34}
				height={4}
				rx={2}
				fill={p.y.mid}
				opacity={0.5}
			/>
			<Circle cx={154} cy={87} r={4} fill={p.y.light} opacity={0.7} />

			{/* Near bubble — lit, no weave, with the lip shadow and sheen. */}
			<G translateX={5} translateY={7}>
				<Path d={BIG_BUBBLE} fill={p.shadow} opacity={0.13} />
			</G>
			<Path d={BIG_BUBBLE} fill={paint.lit} />
			<G clipPath={`url(#${NS}-big)`}>
				<Rect
					x={12}
					y={70}
					width={140}
					height={12}
					fill={p.shadow}
					opacity={0.1}
				/>
				<Path
					d="M12,166 L74,70 L96,70 L34,166 Z"
					fill={paint.spec}
					opacity={0.3}
				/>
				<Rect
					x={134}
					y={70}
					width={18}
					height={96}
					fill={p.shadow}
					opacity={0.07}
				/>
			</G>
			<Path
				d={BIG_BUBBLE}
				fill="none"
				stroke={accent}
				strokeWidth={1.1}
				opacity={0.5}
			/>
			<Path d="M30,71 H134" stroke={p.spec} strokeWidth={1.3} opacity={0.75} />

			<Rect
				x={42}
				y={88}
				width={80}
				height={5}
				rx={2.5}
				fill={p.i.light}
				opacity={0.7}
			/>
			<Rect
				x={42}
				y={100}
				width={64}
				height={4}
				rx={2}
				fill={p.i.light}
				opacity={0.55}
			/>

			{/* Typing dots, each with a contact shadow so they sit in the
			    bubble rather than float on it. */}
			<Circle cx={62} cy={131} r={6} fill={p.shadow} opacity={0.1} />
			<Circle cx={82} cy={131} r={6} fill={p.shadow} opacity={0.1} />
			<Circle cx={102} cy={131} r={6} fill={p.shadow} opacity={0.1} />
			<ACircle animatedProps={dot1} cx={62} cy={128} r={6} fill={paint.shade} />
			<ACircle animatedProps={dot2} cx={82} cy={128} r={6} fill={paint.shade} />
			<ACircle
				animatedProps={dot3}
				cx={102}
				cy={128}
				r={6}
				fill={paint.shade}
			/>

			{/* Paper plane: two planes of folded paper, one catching the light. */}
			<AG animatedProps={planeFloat}>
				<G translateX={3} translateY={4}>
					<Path
						d="M152,118 L168,108 L156,128 Z"
						fill={p.shadow}
						opacity={0.14}
					/>
				</G>
				<Path d="M152,118 L168,108 L156,128 Z" fill={paint.tape} />
				<Path d="M152,118 L162,120 L156,128 Z" fill={p.y.base} opacity={0.75} />
				<Path
					d="M152,118 L168,108"
					stroke={p.spec}
					strokeWidth={1}
					strokeLinecap="round"
					opacity={0.65}
				/>
				<Path
					d="M152,118 L168,108 L156,128 Z"
					fill="none"
					stroke={p.y.deep}
					strokeWidth={0.8}
					strokeLinejoin="round"
					opacity={0.6}
				/>
				<Line
					x1={148}
					y1={116}
					x2={138}
					y2={120}
					stroke={p.y.light}
					strokeWidth={1.5}
					strokeLinecap="round"
					opacity={0.6}
				/>
				<Line
					x1={144}
					y1={120}
					x2={132}
					y2={126}
					stroke={p.y.light}
					strokeWidth={1}
					strokeLinecap="round"
					opacity={0.4}
				/>
			</AG>

			<APath
				animatedProps={spark1}
				d="M18,140 l2,5.5 -2,5.5 -2,-5.5z"
				fill={accent}
			/>
			<ACircle
				animatedProps={spark2}
				cx={170}
				cy={130}
				r={3.5}
				fill={p.y.mid}
			/>
			<APath
				animatedProps={spark3}
				d="M28,48 l2,5 -2,5 -2,-5z"
				fill={p.y.mid}
			/>
			<ACircle animatedProps={spark1} cx={168} cy={58} r={2.5} fill={accent} />
		</Svg>
	);
}
