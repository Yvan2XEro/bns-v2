import Svg, { ClipPath, G, Path } from "react-native-svg";
import {
	ACircle,
	AEllipse,
	AG,
	APath,
	useFloatShadow,
	useFloatY,
	useOrbit,
	usePulse,
	useScalePulse,
} from "../animated";
import { IllustrationDefs, paintIds } from "../defs";
import { useIllustrationPalette } from "../palette";

const NS = "fav";
const paint = paintIds(NS);

/** The heart, drawn once so the fill, the weave and the rim all share it. */
const HEART =
	"M100,134 c-1.5,0-44,-28-44,-54 a24,24 0 0 1 44,-12 24,24 0 0 1 44,12 c0,26-42.5,54-44,54z";

type Props = { color?: string; size?: number };

/**
 * A heart with weight to it: lit from the upper left, so the left lobe takes
 * the light and the right lobe and the underside fall into shade — which is
 * where the ndop weave lives.
 */
export default function Favorites({ color, size = 200 }: Props) {
	const p = useIllustrationPalette();
	const accent = color ?? p.i.base;

	const beat = useScalePulse(0.95, 1.05, 1800, 0);
	const ground = useFloatShadow({
		rx: 50,
		ry: 9,
		rise: 5,
		duration: 1800,
		opacity: 0.9,
	});
	const glow = usePulse(0.5, 1, 2400, 0);
	const orbit1 = useOrbit(4200, 0);
	const orbit2 = useOrbit(6000, 800, true);
	const float1 = useFloatY(148, 10, 2800, 0);
	const float2 = useFloatY(140, 8, 3200, 600);
	const spark1 = usePulse(0.1, 0.8, 1200, 0);
	const spark2 = usePulse(0.08, 0.65, 1500, 350);
	const spark3 = usePulse(0.1, 0.7, 1800, 700);
	const shine = usePulse(0.35, 0.85, 2000, 200);

	return (
		<Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
			<IllustrationDefs ns={NS} p={p}>
				<ClipPath id={`${NS}-heart`}>
					<Path d={HEART} />
				</ClipPath>
			</IllustrationDefs>

			<AEllipse animatedProps={ground} cx={106} cy={162} fill={paint.ground} />

			{/* Warm light pooling behind the heart. */}
			<AG animatedProps={glow}>
				<Path
					d="M100,30 a76,76 0 1 1 -0.1,0 Z"
					fill={paint.glow}
					opacity={0.5}
				/>
			</AG>

			{/* Two smaller hearts in orbit, both in shade — they read as
			    silhouettes, which keeps the eye on the main one. */}
			<AG animatedProps={orbit2} origin="100,95">
				<Path
					d="M156,90 c-.4,0-9,-5.5-9,-11 a5,5 0 0 1 9,-2.5 5,5 0 0 1 9,2.5 c0,5.5-8.6,11-9,11z"
					fill={p.i.mid}
					opacity={0.45}
				/>
			</AG>
			<AG animatedProps={orbit1} origin="100,95">
				<Path
					d="M140,65 c-.3,0-7,-4.5-7,-9 a4,4 0 0 1 7,-2 4,4 0 0 1 7,2 c0,4.5-6.7,9-7,9z"
					fill={p.y.mid}
					opacity={0.7}
				/>
			</AG>

			<AG animatedProps={beat} origin="100,100">
				{/* Contact shadow the heart drops on itself, offset right. */}
				<G translateX={5} translateY={6}>
					<Path d={HEART} fill={p.shadow} opacity={0.14} />
				</G>

				{/* The body. The gradient runs upper-left to lower-right, so the
				    left lobe is lit and the point falls away. */}
				<Path d={HEART} fill={paint.shade} />

				<G clipPath={`url(#${NS}-heart)`}>
					{/* Weave, on the shaded right side only. */}
					<Path
						d="M100,20 H160 V140 H100 Z"
						fill={paint.weave}
						opacity={p.weave.strong}
					/>
					{/* The lit lobe: a wash of light from the upper left. */}
					<Path
						d="M56,20 H104 L92,140 H56 Z"
						fill={paint.spec}
						opacity={0.16}
					/>
					{/* Occlusion where the two lobes meet in the cleft. */}
					<Path
						d="M88,56 Q100,78 112,56 L112,40 L88,40 Z"
						fill={p.shadow}
						opacity={0.22}
					/>
					{/* The point gathers the deepest shade. */}
					<Path d="M70,116 H130 V140 H70 Z" fill={p.i.deep} opacity={0.28} />
				</G>

				{/* Rim light along the top-left curve, the giveaway for a solid
				    body under a single lamp. */}
				<APath
					animatedProps={shine}
					d="M60,76 a24,24 0 0 1 22,-24"
					stroke={p.spec}
					strokeWidth={3}
					strokeLinecap="round"
					fill="none"
				/>
				<Path
					d="M100,134 c-1.5,0-44,-28-44,-54"
					stroke={p.spec}
					strokeWidth={1}
					strokeLinecap="round"
					fill="none"
					opacity={0.2}
				/>
				{/* The specular dot where the surface turns most directly to
				    the light. */}
				<Path d="M78,84 a5.5,5.5 0 1 1 -0.1,0 Z" fill={p.spec} opacity={0.4} />
			</AG>

			<ACircle
				animatedProps={float1}
				cx={100}
				r={3}
				fill={accent}
				opacity={0.32}
			/>
			<ACircle
				animatedProps={float2}
				cx={86}
				r={2}
				fill={p.y.mid}
				opacity={0.4}
			/>

			<APath
				animatedProps={spark1}
				d="M165,68 l2,6 -2,6 -2,-6z"
				fill={accent}
			/>
			<APath animatedProps={spark3} d="M32,90 l2,5 -2,5 -2,-5z" fill={accent} />
			<APath
				animatedProps={spark2}
				d="M166,120 l1.5,4.5 -1.5,4.5 -1.5,-4.5z"
				fill={p.y.mid}
			/>
			<ACircle
				animatedProps={spark1}
				cx={36}
				cy={68}
				r={3.5}
				fill={p.y.light}
			/>
			<ACircle
				animatedProps={spark2}
				cx={162}
				cy={142}
				r={2.5}
				fill={p.y.mid}
			/>
			<ACircle animatedProps={spark3} cx={130} cy={48} r={2} fill={accent} />
		</Svg>
	);
}
