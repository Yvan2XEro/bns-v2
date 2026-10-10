import type { CSSProperties, SVGProps } from "react";

/**
 * Animation descriptors for the illustrations. Each one resolves to a class,
 * a few CSS custom properties and a static fallback; the keyframes live in
 * illustrations.css, behind `prefers-reduced-motion: no-preference`, so a
 * reader who asks for less motion gets the still frame.
 */
export type Anim = {
	kf: "pulse" | "float" | "sweep" | "orbit" | "scale" | "wiggle" | "flicker";
	vars: Record<string, string | number>;
	duration: number;
	delay: number;
	still?: CSSProperties;
	origin?: boolean;
	fill?: boolean;
	reverse?: boolean;
	infinite?: boolean;
};

type Anchor = string | undefined;

const anim = (a: Anim): Anim => a;

export const pulse = (min: number, max: number, duration = 1800, delay = 0) =>
	anim({
		kf: "pulse",
		vars: { "--from": min, "--to": max },
		duration,
		delay,
		still: { opacity: (min + max) / 2 },
		reverse: true,
	});

export const waveOpacity = (
	min: number,
	max: number,
	duration = 1200,
	delay = 0,
) =>
	anim({
		kf: "pulse",
		vars: { "--from": min, "--to": max },
		duration,
		delay,
		still: { opacity: max },
		reverse: true,
	});

export const pulseR = (
	baseR: number,
	maxR: number,
	duration = 2000,
	delay = 0,
) =>
	anim({
		kf: "scale",
		vars: { "--from": 1, "--to": maxR / baseR },
		duration,
		delay,
		fill: true,
		reverse: true,
	});

export const floatY = (
	_baseCy: number,
	distance: number,
	duration = 2500,
	delay = 0,
) =>
	anim({
		kf: "float",
		vars: { "--dist": `${-distance}px` },
		duration,
		delay,
		reverse: true,
	});

export const floatG = (distance: number, duration = 2500, delay = 0) =>
	floatY(0, distance, duration, delay);

export const sweepX = (distance: number, duration = 1800, delay = 0) =>
	anim({
		kf: "sweep",
		vars: { "--dist": `${distance}px` },
		duration,
		delay,
		reverse: true,
	});

export const orbit = (duration = 5000, delay = 0, reverse = false) =>
	anim({
		kf: "orbit",
		vars: { "--to": reverse ? "-360deg" : "360deg" },
		duration,
		delay,
		origin: true,
	});

export const scalePulse = (
	min: number,
	max: number,
	duration = 1800,
	delay = 0,
) =>
	anim({
		kf: "scale",
		vars: { "--from": min, "--to": max },
		duration,
		delay,
		origin: true,
		reverse: true,
	});

export const wiggle = (angle = 8, duration = 900, delay = 0) =>
	anim({
		kf: "wiggle",
		vars: { "--angle": `${angle}deg` },
		duration: duration * 2,
		delay,
		origin: true,
	});

export const flicker = (base: number, peak: number, delay = 0) =>
	anim({
		kf: "flicker",
		vars: { "--base": base, "--peak": peak },
		duration: 695,
		delay,
		still: { opacity: peak },
	});

function animatedStyle(
	a: Anim,
	origin: Anchor,
	style: CSSProperties | undefined,
): CSSProperties {
	const [ox, oy] = origin ? origin.split(",") : [];
	return {
		...a.still,
		...a.vars,
		"--dur": `${a.duration}ms`,
		"--delay": `${a.delay}ms`,
		"--dir": a.reverse ? "alternate" : "normal",
		...(ox && oy ? { "--ox": `${ox}px`, "--oy": `${oy}px` } : {}),
		...style,
	} as CSSProperties;
}

function animatedClass(a: Anim, origin: Anchor, className?: string): string {
	return [
		"ill-anim",
		`ill-${a.kf}`,
		a.fill ? "ill-fill" : "",
		origin ? "ill-origin" : "",
		className ?? "",
	]
		.filter(Boolean)
		.join(" ");
}

type AnimatedProps = Omit<SVGProps<SVGGElement>, "ref"> & {
	anim: Anim;
	origin?: string;
};

function make(tag: "circle" | "ellipse" | "g" | "line" | "path" | "rect") {
	const Element = tag as "g";
	return function AnimatedShape({
		anim: a,
		origin,
		className,
		style,
		...rest
	}: AnimatedProps) {
		return (
			<Element
				{...rest}
				className={animatedClass(a, origin, className)}
				style={animatedStyle(a, origin, style)}
			/>
		);
	};
}

export const ACircle = make("circle");
export const APath = make("path");
export const ARect = make("rect");
export const AG = make("g");
export const ALine = make("line");
export const AEllipse = make("ellipse");
