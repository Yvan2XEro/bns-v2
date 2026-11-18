import Svg, {
	Circle,
	ClipPath,
	Ellipse,
	G,
	Path,
	Rect,
} from "react-native-svg";
import {
	ACircle,
	AEllipse,
	AG,
	APath,
	ARect,
	useFloatG,
	useFloatShadow,
	useFloatY,
	usePulse,
	useWaveOpacity,
} from "../animated";
import { IllustrationDefs, paintIds } from "../defs";
import { useIllustrationPalette } from "../palette";

const NS = "sell";
const paint = paintIds(NS);

const TAG =
	"M68,48 L68,172 a14,14 0 0 0 14,14 h36a14,14 0 0 0 14,-14 L132,48 Z";

/** The coin stack, bottom to top. Each disc is a solid with a real edge. */
const COINS = [
	{ y: 158, h: 16 },
	{ y: 142, h: 14 },
	{ y: 128, h: 13 },
	{ y: 115, h: 0 },
];

type Props = { color?: string; size?: number };

/**
 * A price tag over a stack of coins, with the chart climbing behind.
 *
 * Coins were the weakest thing in the old set — stacked ellipses at 15-65%
 * opacity, so the stack read as glass. Here each coin is opaque, with a milled
 * edge catching the light on its left and falling dark on its right.
 */
export default function Sell({ color, size = 200 }: Props) {
	const p = useIllustrationPalette();
	const accent = color ?? p.i.base;

	const tagFloat = useFloatG(9, 2600, 0);
	const tagShadow = useFloatShadow({
		rx: 44,
		ry: 9,
		rise: 9,
		duration: 2600,
	});
	const glow = usePulse(0.3, 0.7, 2200, 0);
	const coin1 = useFloatY(148, 22, 2000, 0);
	const coin2 = useFloatY(155, 18, 2400, 500);
	const coin3 = useFloatY(162, 15, 2800, 900);
	const coinShine = usePulse(0.3, 0.85, 1400, 200);
	const tagShine = useWaveOpacity(0.3, 0.85, 1800, 0);
	const bar1 = usePulse(0.6, 1, 1600, 0);
	const bar2 = usePulse(0.6, 1, 1600, 300);
	const bar3 = usePulse(0.6, 1, 1600, 600);
	const spark1 = usePulse(0.1, 0.8, 1300, 0);
	const spark2 = usePulse(0.08, 0.65, 1600, 400);

	return (
		<Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
			<IllustrationDefs ns={NS} p={p}>
				<ClipPath id={`${NS}-tag`}>
					<Path d={TAG} />
				</ClipPath>
			</IllustrationDefs>

			<AEllipse
				animatedProps={tagShadow}
				cx={107}
				cy={186}
				fill={paint.ground}
			/>

			<AG animatedProps={glow}>
				<Circle cx={100} cy={100} r={74} fill={paint.glow} opacity={0.4} />
			</AG>

			{/* Chart behind: each bar a lit face with a shaded right return. */}
			<ARect
				animatedProps={bar1}
				x={148}
				y={140}
				width={12}
				height={22}
				rx={2}
				fill={p.i.light}
			/>
			<ARect
				animatedProps={bar1}
				x={156}
				y={140}
				width={4}
				height={22}
				rx={2}
				fill={p.i.mid}
			/>
			<ARect
				animatedProps={bar2}
				x={163}
				y={122}
				width={12}
				height={40}
				rx={2}
				fill={p.i.mid}
			/>
			<ARect
				animatedProps={bar2}
				x={171}
				y={122}
				width={4}
				height={40}
				rx={2}
				fill={p.i.base}
			/>
			<ARect
				animatedProps={bar3}
				x={178}
				y={105}
				width={12}
				height={57}
				rx={2}
				fill={paint.shade}
			/>
			<ARect
				animatedProps={bar3}
				x={178}
				y={105}
				width={4}
				height={57}
				rx={2}
				fill={p.spec}
				opacity={0.2}
			/>
			<Path
				d="M176,100 L176,80 M163,93 L176,79 L189,93"
				stroke={accent}
				strokeWidth={3}
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
			/>

			{/* Coin stack. Shadow first, then each coin: edge, face, highlight. */}
			<Ellipse cx={54} cy={167} rx={24} ry={6} fill={paint.ground} />
			{COINS.map(({ y, h }) => (
				<G key={y}>
					{h > 0 && (
						<>
							{/* The milled edge — one solid band, not a transparent one. */}
							<Rect x={30} y={y - h} width={40} height={h} fill={p.y.base} />
							<Rect
								x={30}
								y={y - h}
								width={9}
								height={h}
								fill={p.y.light}
								opacity={0.45}
							/>
							<Rect
								x={62}
								y={y - h}
								width={8}
								height={h}
								fill={p.y.deep}
								opacity={0.4}
							/>
						</>
					)}
					{/* The face, seen at a steep angle. */}
					<Ellipse cx={50} cy={y - h} rx={20} ry={7} fill={paint.tape} />
					<G translateY={y - h - 115}>
						<Path
							d="M31,115 a20,7 0 0 1 32,-4"
							stroke={p.spec}
							strokeWidth={1.4}
							strokeLinecap="round"
							fill="none"
							opacity={0.5}
						/>
					</G>
					<Ellipse
						cx={50}
						cy={y - h}
						rx={20}
						ry={7}
						fill="none"
						stroke={p.y.deep}
						strokeWidth={0.9}
						opacity={0.5}
					/>
				</G>
			))}
			{/* Top coin gets the struck relief. */}
			<Ellipse cx={50} cy={115} rx={12} ry={4} fill={p.y.deep} opacity={0.4} />
			<Ellipse cx={50} cy={114.2} rx={12} ry={4} fill={p.spec} opacity={0.3} />
			<APath
				animatedProps={coinShine}
				d="M38,112 Q50,108 62,112"
				stroke={p.spec}
				strokeWidth={2}
				strokeLinecap="round"
				fill="none"
			/>

			{/* Coins tumbling up, each a disc on edge. */}
			<ACircle
				animatedProps={coin1}
				cx={38}
				r={8}
				fill={paint.tape}
				stroke={p.y.deep}
				strokeWidth={1.2}
			/>
			<ACircle
				animatedProps={coin2}
				cx={56}
				r={6}
				fill={p.y.mid}
				stroke={p.y.deep}
				strokeWidth={1}
				opacity={0.85}
			/>
			<ACircle
				animatedProps={coin3}
				cx={28}
				r={5}
				fill={p.y.light}
				opacity={0.7}
			/>

			<AG animatedProps={tagFloat}>
				<Path
					d="M100,28 L100,48 M100,28 L118,18"
					stroke={p.i.dark}
					strokeWidth={2.5}
					strokeLinecap="round"
					fill="none"
				/>

				{/* Card stock, lit from the upper left. */}
				<Path d={TAG} fill={paint.tape} />
				<G clipPath={`url(#${NS}-tag)`}>
					<Path d="M104,40 H140 V190 H104 Z" fill={p.y.deep} opacity={0.22} />
					<Path
						d="M104,40 H140 V190 H104 Z"
						fill={paint.weave}
						opacity={p.weave.soft}
					/>
					<Path
						d="M66,190 L96,40 L112,40 L82,190 Z"
						fill={p.spec}
						opacity={0.22}
					/>
					<Path d="M60,40 H140 V58 H60 Z" fill={p.shadow} opacity={0.1} />
				</G>
				<Path
					d={TAG}
					fill="none"
					stroke={p.y.deep}
					strokeWidth={1.2}
					opacity={0.55}
				/>

				{/* Reinforced top band, standing proud of the card. */}
				<Rect x={60} y={40} width={80} height={16} rx={8} fill={p.y.mid} />
				<Rect
					x={60}
					y={40}
					width={80}
					height={5}
					rx={2.5}
					fill={p.spec}
					opacity={0.3}
				/>
				<Rect
					x={60}
					y={40}
					width={80}
					height={16}
					rx={8}
					fill="none"
					stroke={p.y.deep}
					strokeWidth={1}
					opacity={0.45}
				/>

				{/* The hole is punched through: dark first, lit lip after. */}
				<Circle cx={100} cy={48} r={7} fill={p.i.deep} opacity={0.55} />
				<Path
					d="M94,45 a7,7 0 0 1 10,-3"
					stroke={p.spec}
					strokeWidth={1.4}
					strokeLinecap="round"
					fill="none"
					opacity={0.6}
				/>

				{/* Price panel, a paper label stuck on — it casts. */}
				<Rect
					x={78}
					y={74}
					width={48}
					height={88}
					rx={8}
					fill={p.shadow}
					opacity={0.14}
				/>
				<Rect x={76} y={72} width={48} height={88} rx={8} fill={paint.lit} />
				<Rect
					x={76}
					y={72}
					width={48}
					height={5}
					rx={2.5}
					fill={p.spec}
					opacity={0.5}
				/>

				<Rect x={82} y={80} width={36} height={6} rx={3} fill={p.y.light} />
				<Rect x={80} y={96} width={40} height={10} rx={5} fill={p.y.base} />
				<Rect x={82} y={112} width={36} height={6} rx={3} fill={p.y.light} />
				<Rect x={84} y={124} width={32} height={6} rx={3} fill={p.y.mid} />

				<APath
					animatedProps={tagShine}
					d="M80,60 Q100,54 120,60"
					stroke={p.spec}
					strokeWidth={2}
					strokeLinecap="round"
					fill="none"
				/>

				{[79, 84, 88, 93, 97, 102, 106, 111, 115, 120].map((x, i) => (
					<Rect
						key={x}
						x={x}
						y={140}
						width={i % 3 === 0 ? 3 : 1.5}
						height={14}
						rx={0.5}
						fill={p.i.deep}
						opacity={0.65}
					/>
				))}
			</AG>

			<APath
				animatedProps={spark1}
				d="M24,58 l2,6 -2,6 -2,-6z"
				fill={p.y.mid}
			/>
			<APath
				animatedProps={spark2}
				d="M174,68 l1.5,4.5 -1.5,4.5 -1.5,-4.5z"
				fill={accent}
			/>
			<ACircle animatedProps={spark1} cx={170} cy={48} r={3} fill={p.y.light} />
			<ACircle animatedProps={spark2} cx={26} cy={88} r={2.5} fill={accent} />
		</Svg>
	);
}
