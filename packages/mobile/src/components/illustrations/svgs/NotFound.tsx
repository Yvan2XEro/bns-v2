import Svg, { Circle, ClipPath, G, Line, Path, Rect } from "react-native-svg";
import {
	ACircle,
	AEllipse,
	AG,
	APath,
	ARect,
	useFloatG,
	useFloatShadow,
	usePulse,
	useWaveOpacity,
	useWiggle,
} from "../animated";
import { IllustrationDefs, paintIds } from "../defs";
import { useIllustrationPalette } from "../palette";

const NS = "nf";
const paint = paintIds(NS);

type Props = { color?: string; size?: number };

/**
 * A listing card with its corner torn off, a 404 tag hanging from it, and a
 * loupe that found nothing.
 *
 * The tear is the point: the torn edge shows the pulp inside the card, lit on
 * its cut face, and drops a shadow onto the paper below it.
 */
export default function NotFound({ color, size = 200 }: Props) {
	const p = useIllustrationPalette();
	const accent = color ?? p.i.base;

	const cardFloat = useFloatG(8, 2600, 0);
	const ground = useFloatShadow({ rx: 58, ry: 10, rise: 8, duration: 2600 });
	const lensGlow = usePulse(0.3, 0.75, 2100, 120);
	const tagWiggle = useWiggle(7, 1800, 300);
	const spark1 = usePulse(0.12, 0.8, 1300, 0);
	const spark2 = usePulse(0.1, 0.65, 1650, 450);
	const lensShine = useWaveOpacity(0.2, 0.8, 1400, 120);

	return (
		<Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
			<IllustrationDefs ns={NS} p={p}>
				<ClipPath id={`${NS}-card`}>
					<Rect x={42} y={48} width={92} height={112} rx={14} />
				</ClipPath>
				<ClipPath id={`${NS}-photo`}>
					<Rect x={52} y={60} width={72} height={42} rx={10} />
				</ClipPath>
				<ClipPath id={`${NS}-lens`}>
					<Circle cx={132} cy={122} r={23} />
				</ClipPath>
			</IllustrationDefs>

			<AEllipse animatedProps={ground} cx={107} cy={167} fill={paint.ground} />

			<AG animatedProps={cardFloat}>
				{/* Card — lit paper. */}
				<Rect x={42} y={48} width={92} height={112} rx={14} fill={paint.lit} />
				<G clipPath={`url(#${NS}-card)`}>
					<Rect
						x={42}
						y={48}
						width={92}
						height={10}
						fill={p.shadow}
						opacity={0.08}
					/>
					<Path
						d="M42,160 L92,48 L112,48 L62,160 Z"
						fill={paint.spec}
						opacity={0.3}
					/>
					<Rect
						x={118}
						y={48}
						width={16}
						height={112}
						fill={p.shadow}
						opacity={0.07}
					/>
				</G>
				<Rect
					x={42}
					y={48}
					width={92}
					height={112}
					rx={14}
					fill="none"
					stroke={accent}
					strokeWidth={1.2}
					opacity={0.5}
				/>
				<Path
					d="M56,49 H120"
					stroke={p.spec}
					strokeWidth={1.2}
					opacity={0.75}
				/>

				{/* The tear. The fold shows its shaded underside, the cut face
				    catches the light, and the whole thing shadows the card. */}
				<Path d="M116,48 L134,66 L117,69 Z" fill={p.shadow} opacity={0.14} />
				<Path d="M116,48 L134,66 L116,66 Z" fill={paint.shade} />
				<Path
					d="M116,48 L134,66"
					stroke={p.spec}
					strokeWidth={1.4}
					strokeLinecap="round"
					opacity={0.55}
				/>
				<Path
					d="M116,48 L134,66 L116,66 Z"
					fill="none"
					stroke={p.edgeSoft}
					strokeWidth={0.9}
					opacity={0.55}
				/>

				{/* Photo well — recessed, so it is darker than the card face. */}
				<Rect x={52} y={60} width={72} height={42} rx={10} fill={p.i.pale} />
				<G clipPath={`url(#${NS}-photo)`}>
					<Rect
						x={52}
						y={60}
						width={72}
						height={6}
						fill={p.shadow}
						opacity={0.16}
					/>
					<Rect
						x={52}
						y={60}
						width={72}
						height={42}
						fill={paint.weave}
						opacity={p.weave.soft}
					/>
					{/* The hills, each plane taking its own share of light. */}
					<Path
						d="M58,102 L75,80 L87,90 L99,76 L118,102 Z"
						fill={p.i.mid}
						opacity={0.55}
					/>
					<Path
						d="M75,80 L87,90 L78,102 L58,102 Z"
						fill={p.spec}
						opacity={0.14}
					/>
					<Path d="M99,76 L118,102 L104,102 Z" fill={p.i.deep} opacity={0.24} />
					<Circle cx={73} cy={74} r={5} fill={p.y.light} />
					<Circle cx={71.5} cy={72.5} r={2} fill={p.spec} opacity={0.5} />
				</G>

				<Rect
					x={52}
					y={114}
					width={48}
					height={8}
					rx={4}
					fill={p.i.light}
					opacity={0.6}
				/>
				<Rect
					x={52}
					y={128}
					width={58}
					height={6}
					rx={3}
					fill={p.i.light}
					opacity={0.5}
				/>
				<Rect
					x={52}
					y={140}
					width={42}
					height={6}
					rx={3}
					fill={p.i.light}
					opacity={0.4}
				/>

				{/* The strike, with a thin shadow under it. */}
				<Line
					x1={49}
					y1={56}
					x2={129}
					y2={152}
					stroke={p.shadow}
					strokeWidth={5}
					strokeLinecap="round"
					opacity={0.1}
				/>
				<Line
					x1={48}
					y1={54}
					x2={128}
					y2={150}
					stroke={p.y.mid}
					strokeWidth={4}
					strokeLinecap="round"
					opacity={0.55}
				/>
			</AG>

			{/* 404 tag on its string. */}
			<AG animatedProps={tagWiggle} origin="146,64">
				<Line
					x1={146}
					y1={46}
					x2={146}
					y2={56}
					stroke={p.i.dark}
					strokeWidth={2}
					strokeLinecap="round"
				/>
				<G translateX={3} translateY={4}>
					<Rect
						x={126}
						y={56}
						width={40}
						height={22}
						rx={11}
						fill={p.shadow}
						opacity={0.16}
					/>
				</G>
				<Rect x={126} y={56} width={40} height={22} rx={11} fill={paint.tape} />
				<Rect
					x={126}
					y={56}
					width={40}
					height={7}
					rx={3.5}
					fill={p.spec}
					opacity={0.22}
				/>
				<Rect
					x={126}
					y={56}
					width={40}
					height={22}
					rx={11}
					fill="none"
					stroke={p.y.deep}
					strokeWidth={1}
					opacity={0.5}
				/>
				{/* The digits, cut in: dark glyph, lit lip above it. */}
				<Path
					d="M139 64 h-3 v4 h3 v-4Zm0 7 h-3 v3 h3 v-3Zm6-7 h-3 v10 h3V64Zm6 0 h-3 v4 h3 v-4Zm0 7 h-3 v3 h3 v-3Z"
					fill={p.y.deep}
					opacity={0.45}
				/>
				<Path
					d="M139 63 h-3 v4 h3 v-4Zm0 7 h-3 v3 h3 v-3Zm6-7 h-3 v10 h3V63Zm6 0 h-3 v4 h3 v-4Zm0 7 h-3 v3 h3 v-3Z"
					fill={p.spec}
				/>
			</AG>

			{/* Loupe. */}
			<AG animatedProps={lensGlow}>
				<Circle cx={132} cy={126} r={30} fill={paint.glow} opacity={0.5} />
			</AG>
			<Circle
				cx={132}
				cy={122}
				r={23}
				fill={p.i.pale}
				opacity={p.isDark ? 0.5 : 0.3}
			/>
			<G clipPath={`url(#${NS}-lens)`}>
				<Rect
					x={108}
					y={98}
					width={48}
					height={48}
					fill={paint.weave}
					opacity={p.weave.soft}
				/>
				<Path
					d="M109,145 L138,99 L152,99 L123,145 Z"
					fill={paint.spec}
					opacity={0.26}
				/>
			</G>
			<Circle
				cx={132}
				cy={122}
				r={24}
				fill="none"
				stroke={paint.shade}
				strokeWidth={4}
			/>
			<Path
				d="M116,106 a24,24 0 0 1 22,-7"
				stroke={p.spec}
				strokeWidth={1.8}
				strokeLinecap="round"
				fill="none"
				opacity={0.7}
			/>
			<APath
				animatedProps={lensShine}
				d="M123 112 Q129 106 138 110"
				stroke={p.spec}
				strokeWidth={2.5}
				strokeLinecap="round"
				fill="none"
			/>
			<Line
				x1={148}
				y1={138}
				x2={162}
				y2={152}
				stroke={p.i.dark}
				strokeWidth={6}
				strokeLinecap="round"
			/>
			<Line
				x1={147}
				y1={137}
				x2={160}
				y2={150}
				stroke={p.i.mid}
				strokeWidth={2.4}
				strokeLinecap="round"
				opacity={0.9}
			/>

			{/* The question mark, standing proud of the page. */}
			<G translateX={2} translateY={3}>
				<Path
					d="M71 26 c-9 0 -14 5 -14 11 h7 c0 -3 2 -5 7 -5 4 0 7 2 7 5 0 2 -1 4 -4 6 -5 3 -7 6 -7 11 v2 h7 v-2 c0 -3 1 -4 4 -6 5 -4 8 -7 8 -13 0 -6 -5 -9 -15 -9Zm-4 37 h8 v8 h-8z"
					fill={p.shadow}
					opacity={0.16}
				/>
			</G>
			<Path
				d="M71 26 c-9 0 -14 5 -14 11 h7 c0 -3 2 -5 7 -5 4 0 7 2 7 5 0 2 -1 4 -4 6 -5 3 -7 6 -7 11 v2 h7 v-2 c0 -3 1 -4 4 -6 5 -4 8 -7 8 -13 0 -6 -5 -9 -15 -9Zm-4 37 h8 v8 h-8z"
				fill={p.y.mid}
			/>
			<Path
				d="M71 26 c-9 0 -14 5 -14 11 h7 c0 -3 2 -5 7 -5"
				stroke={p.y.light}
				strokeWidth={1.4}
				strokeLinecap="round"
				fill="none"
				opacity={0.8}
			/>

			<ACircle animatedProps={spark1} cx={34} cy={124} r={4} fill={accent} />
			<ACircle animatedProps={spark2} cx={168} cy={88} r={3} fill={p.y.mid} />
			<ARect
				animatedProps={spark1}
				x={156}
				y={40}
				width={4}
				height={12}
				rx={2}
				fill={accent}
			/>
			<ARect
				animatedProps={spark1}
				x={152}
				y={44}
				width={12}
				height={4}
				rx={2}
				fill={accent}
			/>
		</Svg>
	);
}
