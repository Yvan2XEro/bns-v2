/**
 * The shared paint: gradients and the ndop weave, declared once per drawing.
 *
 * react-native-svg resolves `url(#id)` per Svg root, so these cannot be
 * hoisted above the tree the way a web <defs> can be — but the ids and the
 * stops can, which is what keeps thirteen drawings lit by the same lamp.
 *
 * Ids are namespaced per illustration so two Svg roots mounted at once (an
 * empty state behind a sheet, say) never trade gradients.
 */

import type { ReactNode } from "react";
import {
	Circle,
	ClipPath,
	Defs,
	LinearGradient,
	Path,
	Pattern,
	RadialGradient,
	Stop,
} from "react-native-svg";
import { type IllustrationPalette, LIGHT_SOURCE } from "./palette";

/** Builds the `url(#…)` references for one illustration's namespace. */
export function paintIds(ns: string) {
	return {
		lit: `url(#${ns}-lit)`,
		shade: `url(#${ns}-shade)`,
		flapNear: `url(#${ns}-flapNear)`,
		flapFar: `url(#${ns}-flapFar)`,
		tape: `url(#${ns}-tape)`,
		spec: `url(#${ns}-spec)`,
		glow: `url(#${ns}-glow)`,
		ground: `url(#${ns}-ground)`,
		weave: `url(#${ns}-weave)`,
	} as const;
}

export type PaintIds = ReturnType<typeof paintIds>;

/**
 * The ndop lozenge, strung on its line with a dot between — the resist mark of
 * Grassfields cloth, the same figure as the shell's background pattern but
 * drawn at illustration scale.
 *
 * It is painted light and laid over a shaded face at low opacity, so it reads
 * as the weave of the surface rather than as a motif printed on top. It never
 * goes on a lit face.
 */
function NdopWeave({ id, color }: { id: string; color: string }) {
	return (
		<Pattern id={id} width={15} height={15} patternUnits="userSpaceOnUse">
			<Path
				d="M7.5 1.5 L13.5 7.5 L7.5 13.5 L1.5 7.5 Z"
				stroke={color}
				strokeWidth={0.9}
				fill="none"
			/>
			<Path d="M0 7.5 H1.5 M13.5 7.5 H15" stroke={color} strokeWidth={0.9} />
			<Circle cx={7.5} cy={7.5} r={1.1} fill={color} />
		</Pattern>
	);
}

type Props = {
	/** Namespace prefix — one per illustration, e.g. "empty". */
	ns: string;
	p: IllustrationPalette;
	/** Extra <ClipPath> or gradients this illustration needs on its own. */
	children?: ReactNode;
};

/**
 * Drop this inside an <Svg> and every surface in that drawing can reach the
 * same lamp. Pair it with `paintIds(ns)` for the references.
 */
export function IllustrationDefs({ ns, p, children }: Props) {
	const g = LIGHT_SOURCE.gradient;
	return (
		<Defs>
			{/* A face turned toward the light: bright upper-left, falling away. */}
			<LinearGradient id={`${ns}-lit`} {...g.lit}>
				<Stop offset="0" stopColor={p.i.lit} />
				<Stop offset="0.5" stopColor={p.i.pale} />
				<Stop offset="1" stopColor={p.i.light} />
			</LinearGradient>

			{/* A side panel in shade, catching a rim at its outer edge. */}
			<LinearGradient id={`${ns}-shade`} {...g.shade}>
				<Stop offset="0" stopColor={p.i.base} />
				<Stop offset="1" stopColor={p.i.dark} />
			</LinearGradient>

			{/* A flap folded back toward the light. */}
			<LinearGradient id={`${ns}-flapNear`} {...g.flapNear}>
				<Stop offset="0" stopColor={p.i.light} />
				<Stop offset="1" stopColor={p.i.lit} />
			</LinearGradient>

			{/* And one folded away from it. */}
			<LinearGradient id={`${ns}-flapFar`} {...g.flapFar}>
				<Stop offset="0" stopColor={p.i.mid} />
				<Stop offset="1" stopColor={p.i.pale} />
			</LinearGradient>

			{/* Signage yellow with a roll to it — tape, price tags, coin edges. */}
			<LinearGradient id={`${ns}-tape`} x1="0" y1="0" x2="0.3" y2="1">
				<Stop offset="0" stopColor={p.y.light} />
				<Stop offset="0.45" stopColor={p.y.mid} />
				<Stop offset="1" stopColor={p.y.base} />
			</LinearGradient>

			{/* The oblique highlight that slides across a lit face. */}
			<LinearGradient id={`${ns}-spec`} x1="0" y1="0" x2="1" y2="1">
				<Stop offset="0" stopColor={p.spec} stopOpacity="0.9" />
				<Stop offset="1" stopColor={p.spec} stopOpacity="0" />
			</LinearGradient>

			{/* Warm light from inside something, spilling past its edges. */}
			<RadialGradient id={`${ns}-glow`} cx="0.5" cy="0.9" r="0.85">
				<Stop offset="0" stopColor={p.y.mid} stopOpacity="0.8" />
				<Stop offset="0.5" stopColor={p.y.mid} stopOpacity="0.16" />
				<Stop offset="1" stopColor={p.y.mid} stopOpacity="0" />
			</RadialGradient>

			{/* Ground shadow: dense at the contact point, dissolved at the rim. */}
			<RadialGradient id={`${ns}-ground`} cx="0.5" cy="0.5" r="0.5">
				<Stop offset="0" stopColor={p.shadow} stopOpacity="0.32" />
				<Stop offset="0.55" stopColor={p.shadow} stopOpacity="0.11" />
				<Stop offset="1" stopColor={p.shadow} stopOpacity="0" />
			</RadialGradient>

			<NdopWeave id={`${ns}-weave`} color={p.spec} />

			{children}
		</Defs>
	);
}

/** Convenience re-export so illustrations import clip paths from one place. */
export { ClipPath };
