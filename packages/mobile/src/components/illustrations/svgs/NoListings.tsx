import Svg, {
	Circle,
	ClipPath,
	Ellipse,
	G,
	Line,
	Path,
	Rect,
} from "react-native-svg";
import {
	ACircle,
	AEllipse,
	AG,
	APath,
	ARect,
	useFloatShadow,
	useFloatY,
	usePulse,
	useWaveOpacity,
	useWiggle,
} from "../animated";
import { IllustrationDefs, paintIds } from "../defs";
import { useIllustrationPalette } from "../palette";

const NS = "shop";
const paint = paintIds(NS);

const AWNING =
	"M26,90 Q55,108 84,90 Q113,108 142,90 Q171,108 178,90 L178,82 L26,82 Z";

type Props = { color?: string; size?: number };

/**
 * A shuttered shopfront.
 *
 * The lamp is upper-left, so the facade is lit, the left return is in shade,
 * and the awning throws a hard band across the top of the wall. The weave
 * runs on the return and in the shadow the awning casts — the cloth of the
 * awning itself, read on the wall behind it.
 */
export default function NoListings({ color, size = 200 }: Props) {
	const p = useIllustrationPalette();
	const accent = color ?? p.i.base;

	const glow = usePulse(0.25, 0.6, 2400, 0);
	const sign = useWiggle(6, 2200, 0);
	const signShadow = useFloatShadow({ rx: 30, ry: 4, rise: 3, duration: 2200 });
	const winLight = useWaveOpacity(0.12, 0.42, 1800, 0);
	const winLight2 = useWaveOpacity(0.1, 0.34, 2000, 600);
	const tumb1 = useFloatY(148, 6, 2000, 0);
	const tumb2 = useFloatY(152, 4, 2600, 800);
	const spark1 = usePulse(0.1, 0.75, 1300, 0);
	const spark2 = usePulse(0.08, 0.65, 1600, 450);
	const spark3 = usePulse(0.1, 0.7, 1900, 800);

	return (
		<Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
			<IllustrationDefs ns={NS} p={p}>
				<ClipPath id={`${NS}-wall`}>
					<Rect x={30} y={82} width={140} height={82} rx={4} />
				</ClipPath>
				<ClipPath id={`${NS}-return`}>
					<Path d="M18,70 L30,82 L30,164 L18,152 Z" />
				</ClipPath>
				<ClipPath id={`${NS}-awning`}>
					<Path d={AWNING} />
				</ClipPath>
			</IllustrationDefs>

			<AEllipse
				animatedProps={glow}
				cx={100}
				cy={96}
				rx={76}
				ry={70}
				fill={paint.glow}
				opacity={0.3}
			/>
			<Ellipse cx={107} cy={167} rx={70} ry={10} fill={paint.ground} />

			{/* Facade — lit. */}
			<Rect x={30} y={82} width={140} height={82} rx={4} fill={paint.lit} />
			<G clipPath={`url(#${NS}-wall)`}>
				{/* The awning's cast shadow, and the cloth read on the wall. */}
				<Rect
					x={30}
					y={82}
					width={140}
					height={22}
					fill={p.shadow}
					opacity={0.17}
				/>
				<Rect
					x={30}
					y={82}
					width={140}
					height={22}
					fill={paint.weave}
					opacity={p.weave.soft}
				/>
				<Path
					d="M30,164 L96,82 L120,82 L54,164 Z"
					fill={paint.spec}
					opacity={0.22}
				/>
				<Rect
					x={152}
					y={82}
					width={18}
					height={82}
					fill={p.shadow}
					opacity={0.09}
				/>
			</G>
			<Rect
				x={30}
				y={82}
				width={140}
				height={82}
				rx={4}
				fill="none"
				stroke={accent}
				strokeWidth={1.3}
				opacity={0.5}
			/>

			{/* Left return — in shade, weave-bearing. */}
			<Path d="M18,70 L30,82 L30,164 L18,152 Z" fill={paint.shade} />
			<G clipPath={`url(#${NS}-return)`}>
				<Rect
					x={14}
					y={66}
					width={20}
					height={102}
					fill={paint.weave}
					opacity={p.weave.strong}
				/>
			</G>
			<Path
				d="M18,70 L30,82 L30,164 L18,152 Z"
				fill="none"
				stroke={p.edgeSoft}
				strokeWidth={0.9}
				opacity={0.6}
			/>

			{/* Roof: two slopes, one toward the lamp and one away. */}
			<Path d="M18,84 L100,42 L182,84 Z" fill={paint.shade} />
			<Path d="M18,84 L100,42 L100,84 Z" fill={p.spec} opacity={0.18} />
			<Path
				d="M18,84 L100,42"
				stroke={p.spec}
				strokeWidth={1.6}
				strokeLinecap="round"
				opacity={0.6}
			/>
			<Path
				d="M100,42 L182,84"
				stroke={p.i.deep}
				strokeWidth={1.2}
				strokeLinecap="round"
				opacity={0.5}
			/>
			<Rect x={90} y={38} width={20} height={9} rx={4.5} fill={p.i.deep} />
			<Rect
				x={90}
				y={38}
				width={20}
				height={3}
				rx={1.5}
				fill={p.spec}
				opacity={0.3}
			/>

			{/* Awning: scalloped cloth, each bay catching light on its crown
			    and falling dark in the valley between. */}
			<Path d={AWNING} fill={paint.tape} />
			<G clipPath={`url(#${NS}-awning)`}>
				<Path d="M26,78 H178 V88 H26 Z" fill={p.spec} opacity={0.26} />
				{[46, 100, 154].map((cx) => (
					<Path
						key={cx}
						d={`M${cx - 9},82 Q${cx},98 ${cx + 9},82 Z`}
						fill={p.spec}
						opacity={0.3}
					/>
				))}
				{[73, 127].map((cx) => (
					<Path
						key={cx}
						d={`M${cx - 7},82 Q${cx},100 ${cx + 7},82 Z`}
						fill={p.y.deep}
						opacity={0.28}
					/>
				))}
				<Path d="M26,96 H178 V110 H26 Z" fill={p.y.deep} opacity={0.2} />
			</G>
			<Path
				d={AWNING}
				fill="none"
				stroke={p.y.deep}
				strokeWidth={1}
				opacity={0.5}
			/>

			{/* Windows. The well is recessed, so it is darker than the wall,
			    and the warm light leaks through the slats. */}
			{[
				{ x: 38, slatX: 40, mull: 64, a: winLight, b: winLight2, sill: 34 },
				{ x: 110, slatX: 112, mull: 136, a: winLight2, b: winLight, sill: 106 },
			].map((w) => (
				<G key={w.x}>
					<Rect x={w.x} y={98} width={52} height={44} rx={4} fill={p.i.pale} />
					<Rect
						x={w.x}
						y={98}
						width={52}
						height={5}
						fill={p.shadow}
						opacity={0.2}
					/>
					<ARect
						animatedProps={w.a}
						x={w.slatX}
						y={100}
						width={22}
						height={40}
						rx={2}
						fill={p.y.mid}
					/>
					<ARect
						animatedProps={w.b}
						x={w.mull}
						y={100}
						width={22}
						height={40}
						rx={2}
						fill={p.y.mid}
					/>
					{/* Slats, each with its own thin shadow below. */}
					{[102, 110, 118, 126, 134].map((y) => (
						<G key={y}>
							<Rect
								x={w.slatX}
								y={y}
								width={48}
								height={4}
								rx={1}
								fill={paint.shade}
								opacity={0.7}
							/>
							<Rect
								x={w.slatX}
								y={y + 4}
								width={48}
								height={1.5}
								fill={p.shadow}
								opacity={0.18}
							/>
						</G>
					))}
					<Line
						x1={w.mull}
						y1={98}
						x2={w.mull}
						y2={142}
						stroke={p.i.dark}
						strokeWidth={2}
						opacity={0.5}
					/>
					<Rect
						x={w.x}
						y={98}
						width={52}
						height={44}
						rx={4}
						fill="none"
						stroke={accent}
						strokeWidth={1.3}
						opacity={0.55}
					/>
					{/* Sill: a ledge, so it is lit on top and shadows the wall. */}
					<Rect
						x={w.sill}
						y={142}
						width={60}
						height={5}
						rx={2}
						fill={paint.shade}
					/>
					<Rect
						x={w.sill}
						y={142}
						width={60}
						height={1.8}
						rx={0.9}
						fill={p.spec}
						opacity={0.45}
					/>
					<Rect
						x={w.sill + 2}
						y={147}
						width={60}
						height={2.5}
						fill={p.shadow}
						opacity={0.14}
					/>
				</G>
			))}

			{/* Door, set into the wall: the reveal shadows its left edge. */}
			<Path
				d="M84,164 L84,130 A16,16 0 0 1 116,130 L116,164 Z"
				fill={paint.shade}
			/>
			<Path
				d="M84,164 L84,130 A16,16 0 0 1 94,114 L94,164 Z"
				fill={p.i.deep}
				opacity={0.3}
			/>
			<Path
				d="M82,164 L82,130 A18,18 0 0 1 118,130 L118,164"
				fill="none"
				stroke={p.i.deep}
				strokeWidth={1.6}
			/>
			<Path
				d="M84,130 A16,16 0 0 1 104,114.5"
				stroke={p.spec}
				strokeWidth={1.2}
				strokeLinecap="round"
				fill="none"
				opacity={0.35}
			/>
			{[86, 103].map((x) => (
				<G key={x}>
					<Rect
						x={x}
						y={134}
						width={11}
						height={16}
						rx={2}
						fill={p.i.deep}
						opacity={0.45}
					/>
					<Rect
						x={x}
						y={133.2}
						width={11}
						height={1.4}
						rx={0.7}
						fill={p.spec}
						opacity={0.22}
					/>
				</G>
			))}
			<Circle cx={100} cy={150} r={3.2} fill={p.y.base} />
			<Circle cx={99} cy={149} r={1.4} fill={p.spec} opacity={0.6} />
			<Rect x={74} y={162} width={52} height={6} rx={2} fill={paint.shade} />
			<Rect
				x={74}
				y={162}
				width={52}
				height={2}
				rx={1}
				fill={p.spec}
				opacity={0.4}
			/>

			{/* The closed sign, hanging and casting on the awning. */}
			<AEllipse
				animatedProps={signShadow}
				cx={103}
				cy={118}
				fill={paint.ground}
			/>
			<AG animatedProps={sign} origin="100,82">
				<Line
					x1={100}
					y1={82}
					x2={100}
					y2={90}
					stroke={p.i.deep}
					strokeWidth={2}
				/>
				<Rect x={72} y={90} width={56} height={24} rx={6} fill={paint.tape} />
				<Rect
					x={72}
					y={90}
					width={56}
					height={7}
					rx={3.5}
					fill={p.spec}
					opacity={0.28}
				/>
				<Rect
					x={120}
					y={90}
					width={8}
					height={24}
					rx={4}
					fill={p.y.deep}
					opacity={0.25}
				/>
				<Rect
					x={72}
					y={90}
					width={56}
					height={24}
					rx={6}
					fill="none"
					stroke={p.y.deep}
					strokeWidth={1.2}
					opacity={0.6}
				/>
				<Rect
					x={78}
					y={96}
					width={20}
					height={4}
					rx={2}
					fill={p.i.deep}
					opacity={0.6}
				/>
				<Rect
					x={100}
					y={96}
					width={10}
					height={4}
					rx={2}
					fill={p.i.deep}
					opacity={0.45}
				/>
				<Rect
					x={78}
					y={104}
					width={32}
					height={3}
					rx={1.5}
					fill={p.i.deep}
					opacity={0.4}
				/>
			</AG>

			<ACircle
				animatedProps={tumb1}
				cx={22}
				r={9}
				fill="none"
				stroke={p.y.mid}
				strokeWidth={2}
				opacity={0.55}
			/>
			<Circle cx={22} cy={148} r={5} fill={p.y.mid} opacity={0.22} />
			<ACircle
				animatedProps={tumb2}
				cx={178}
				r={7}
				fill="none"
				stroke={p.y.light}
				strokeWidth={1.5}
				opacity={0.45}
			/>

			<APath animatedProps={spark1} d="M22,56 l2,6 -2,6 -2,-6z" fill={accent} />
			<APath
				animatedProps={spark2}
				d="M178,62 l1.5,5 -1.5,5 -1.5,-5z"
				fill={p.y.mid}
			/>
			<ACircle
				animatedProps={spark3}
				cx={162}
				cy={104}
				r={3}
				fill={p.y.light}
			/>
			<ACircle animatedProps={spark1} cx={38} cy={168} r={2.5} fill={accent} />
		</Svg>
	);
}
