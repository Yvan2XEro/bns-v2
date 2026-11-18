import type { ReactElement } from "react";
import { type CardFormat, clip, STORY_SAFE_MARGIN } from "./formats";
import type { CardFact } from "./shop-facts";

/** What a card says, whatever it shows: a listing or a shop. */
export interface CardContent {
	/** The listing's title, the shop's name. */
	headline: string;
	/** The price: the line in colour. */
	highlight: string | null;
	/** A shop's rating, drawn as stars, with its reviews ("4,8 · 23 avis"). */
	stars: { value: number; label: string } | null;
	/** A shop's selling points: verified, new listings, replies… */
	facts: CardFact[];
	/** Who sells: the shop (or the seller), with its logo and badge. */
	byline: { name: string; logo: string | null; verified: boolean } | null;
	/** Where: the city. */
	place: string | null;
	/** A shop's tagline; a listing has none. */
	blurb: string | null;
	/** Data URI, already cropped for this format. */
	photo: string | null;
	/** Where the card leads, printed and in the QR code. */
	link: { display: string; qr: string };
	labels: { cta: string; verified: string };
	logo: string;
}

const NIGHT = "#0f172a";
const PANEL = "#1e293b";
const MUTED = "#94a3b8";
const AMBER = "#fbbf24";
const BLUE = "#2563eb";

/** Drawn, not typed: the renderer shows no tick from the font. */
const CHECK = `data:image/svg+xml;base64,${Buffer.from(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#bbf7d0" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
).toString("base64")}`;

function Brand({ logo, size }: { logo: string; size: number }) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: size * 0.35 }}>
			{/* biome-ignore lint/performance/noImgElement: a card is drawn by Satori, not the browser */}
			<img src={logo} width={size} height={size * 0.8} alt="" />
			<div
				style={{
					display: "flex",
					fontSize: size * 0.55,
					fontWeight: 800,
					color: "#ffffff",
					letterSpacing: -0.5,
				}}
			>
				BuyNSellem
			</div>
		</div>
	);
}

function Photo({
	content,
	width,
	height,
	radius,
}: {
	content: CardContent;
	width: number;
	height: number;
	radius: number;
}) {
	if (content.photo) {
		return (
			// biome-ignore lint/performance/noImgElement: a card is drawn by Satori, not the browser
			<img
				src={content.photo}
				width={width}
				height={height}
				alt=""
				style={{ borderRadius: radius, objectFit: "cover" }}
			/>
		);
	}
	// No photo: the initial on the brand colour, never an empty frame.
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width,
				height,
				borderRadius: radius,
				backgroundImage: `linear-gradient(135deg, ${BLUE}, #1e3a8a)`,
				color: "#ffffff",
				fontSize: Math.min(width, height) * 0.4,
				fontWeight: 800,
			}}
		>
			{content.headline.slice(0, 1).toUpperCase()}
		</div>
	);
}

function Byline({ content, size }: { content: CardContent; size: number }) {
	if (!content.byline) return null;
	const { name, logo, verified } = content.byline;
	return (
		<div style={{ display: "flex", alignItems: "center", gap: size * 0.4 }}>
			{logo ? (
				// biome-ignore lint/performance/noImgElement: a card is drawn by Satori, not the browser
				<img
					src={logo}
					width={size}
					height={size}
					alt=""
					style={{ borderRadius: size / 2, objectFit: "cover" }}
				/>
			) : null}
			<div
				style={{
					display: "flex",
					fontSize: size * 0.56,
					fontWeight: 600,
					color: "#e2e8f0",
				}}
			>
				{clip(name, 28)}
			</div>
			{verified ? (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: size * 0.1,
						fontSize: size * 0.36,
						fontWeight: 600,
						color: "#bbf7d0",
						backgroundColor: "#14532d",
						borderRadius: size,
						padding: `${size * 0.08}px ${size * 0.28}px`,
					}}
				>
					{/* biome-ignore lint/performance/noImgElement: a card is drawn by Satori, not the browser */}
					<img src={CHECK} width={size * 0.36} height={size * 0.36} alt="" />
					{content.labels.verified}
				</div>
			) : null}
		</div>
	);
}

const star = (fill: string) =>
	`data:image/svg+xml;base64,${Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="h"><stop offset="50%" stop-color="${AMBER}"/><stop offset="50%" stop-color="#475569"/></linearGradient></defs><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="${fill}"/></svg>`,
	).toString("base64")}`;
const STAR_FULL = star(AMBER);
const STAR_HALF = star("url(#h)");
const STAR_EMPTY = star("#475569");

/** Five stars, to the half, then the rating and reviews. */
function Stars({ content, size }: { content: CardContent; size: number }) {
	if (!content.stars) return null;
	const { value, label } = content.stars;
	return (
		<div style={{ display: "flex", alignItems: "center", gap: size * 0.3 }}>
			<div style={{ display: "flex", gap: size * 0.08 }}>
				{[0, 1, 2, 3, 4].map((i) => (
					// biome-ignore lint/performance/noImgElement: a card is drawn by Satori, not the browser
					<img
						key={i}
						src={
							value >= i + 0.75
								? STAR_FULL
								: value >= i + 0.25
									? STAR_HALF
									: STAR_EMPTY
						}
						width={size}
						height={size}
						alt=""
					/>
				))}
			</div>
			<div
				style={{
					display: "flex",
					fontSize: size * 0.72,
					fontWeight: 800,
					color: AMBER,
				}}
			>
				{label}
			</div>
		</div>
	);
}

const FACT_TONES: Record<CardFact["tone"], { color: string; bg: string }> = {
	verified: { color: "#bbf7d0", bg: "#14532d" },
	fresh: { color: "#fde68a", bg: "#713f12" },
	plain: { color: "#e2e8f0", bg: "#334155" },
};

/** A shop's selling points, as pills. */
function Facts({ content, size }: { content: CardContent; size: number }) {
	if (content.facts.length === 0) return null;
	return (
		<div style={{ display: "flex", flexWrap: "wrap", gap: size * 0.3 }}>
			{content.facts.map((fact) => {
				const tone = FACT_TONES[fact.tone];
				return (
					<div
						key={fact.text}
						style={{
							display: "flex",
							alignItems: "center",
							gap: size * 0.2,
							fontSize: size * 0.5,
							fontWeight: 600,
							color: tone.color,
							backgroundColor: tone.bg,
							borderRadius: size,
							padding: `${size * 0.16}px ${size * 0.4}px`,
						}}
					>
						{fact.tone === "verified" ? (
							// biome-ignore lint/performance/noImgElement: a card is drawn by Satori, not the browser
							<img src={CHECK} width={size * 0.5} height={size * 0.5} alt="" />
						) : null}
						{clip(fact.text, 40)}
					</div>
				);
			})}
		</div>
	);
}

function Link({
	content,
	qrSize,
	textSize,
}: {
	content: CardContent;
	qrSize: number;
	textSize: number;
}) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: qrSize * 0.18 }}>
			<div
				style={{
					display: "flex",
					backgroundColor: "#ffffff",
					borderRadius: qrSize * 0.1,
					padding: qrSize * 0.05,
				}}
			>
				{/* biome-ignore lint/performance/noImgElement: a card is drawn by Satori, not the browser */}
				<img
					src={content.link.qr}
					width={qrSize * 0.9}
					height={qrSize * 0.9}
					alt=""
				/>
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				<div
					style={{
						display: "flex",
						fontSize: textSize * 1.15,
						fontWeight: 800,
						color: "#ffffff",
					}}
				>
					{content.labels.cta}
				</div>
				<div style={{ display: "flex", fontSize: textSize, color: MUTED }}>
					{content.link.display}
				</div>
			</div>
		</div>
	);
}

function Text({
	text,
	size,
	weight,
	color,
	max,
}: {
	text: string | null;
	size: number;
	weight: 400 | 600 | 800;
	color: string;
	max: number;
}) {
	if (!text) return null;
	return (
		<div
			style={{
				display: "flex",
				fontSize: size,
				fontWeight: weight,
				color,
				lineHeight: 1.15,
				letterSpacing: weight === 800 ? -0.5 : 0,
			}}
		>
			{clip(text, max)}
		</div>
	);
}

/** 9:16, for Status and stories: everything that matters between the bars. */
function Story(content: CardContent) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: 1080,
				height: 1920,
				padding: `${STORY_SAFE_MARGIN}px 72px`,
				backgroundColor: NIGHT,
				backgroundImage: `radial-gradient(circle at 85% 8%, #1e3a8a 0%, ${NIGHT} 55%)`,
				fontFamily: "DM Sans",
			}}
		>
			<Brand logo={content.logo} size={64} />
			<div style={{ display: "flex", marginTop: 28 }}>
				{/* A shop says more under its photo: the photo gives it room. */}
				<Photo
					content={content}
					width={936}
					height={content.facts.length > 0 ? 580 : 720}
					radius={44}
				/>
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 14,
					marginTop: 32,
				}}
			>
				<Text
					text={content.headline}
					size={60}
					weight={800}
					color="#ffffff"
					max={62}
				/>
				<Text
					text={content.highlight}
					size={(content.highlight?.length ?? 0) > 18 ? 60 : 80}
					weight={800}
					color={AMBER}
					max={48}
				/>
				<Stars content={content} size={60} />
				<Facts content={content} size={58} />
				<Text
					text={content.blurb}
					size={36}
					weight={400}
					color={MUTED}
					max={content.facts.length > 0 ? 60 : 90}
				/>
				<Byline content={content} size={64} />
				<Text
					text={content.place}
					size={34}
					weight={400}
					color={MUTED}
					max={40}
				/>
			</div>
			<div style={{ display: "flex", marginTop: "auto", paddingTop: 36 }}>
				<Link content={content} qrSize={176} textSize={34} />
			</div>
		</div>
	);
}

/** 1.91:1, the link preview: the photo on the left, the facts on the right. */
function Preview(content: CardContent) {
	return (
		<div
			style={{
				display: "flex",
				width: 1200,
				height: 630,
				backgroundColor: NIGHT,
				fontFamily: "DM Sans",
			}}
		>
			<Photo content={content} width={630} height={630} radius={0} />
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					width: 570,
					padding: "44px 48px",
					gap: 14,
				}}
			>
				<Brand logo={content.logo} size={44} />
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 12,
						marginTop: 18,
					}}
				>
					<Text
						text={content.headline}
						size={46}
						weight={800}
						color="#ffffff"
						max={70}
					/>
					<Text
						text={content.highlight}
						size={(content.highlight?.length ?? 0) > 18 ? 38 : 52}
						weight={800}
						color={AMBER}
						max={48}
					/>
					<Stars content={content} size={36} />
					<Facts content={content} size={40} />
					<Text
						text={content.blurb}
						size={24}
						weight={400}
						color={MUTED}
						max={content.facts.length > 0 ? 60 : 90}
					/>
					<Byline content={content} size={40} />
					<Text
						text={content.place}
						size={24}
						weight={400}
						color={MUTED}
						max={34}
					/>
				</div>
				<div
					style={{
						display: "flex",
						marginTop: "auto",
						fontSize: 24,
						color: MUTED,
					}}
				>
					{content.link.display}
				</div>
			</div>
		</div>
	);
}

/** 1:1, a feed post: the photo on top, the facts and the code below. */
function Square(content: CardContent) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: 1080,
				height: 1080,
				backgroundColor: NIGHT,
				fontFamily: "DM Sans",
			}}
		>
			<Photo content={content} width={1080} height={620} radius={0} />
			<div
				style={{
					display: "flex",
					flex: 1,
					padding: "40px 56px",
					gap: 40,
					backgroundColor: PANEL,
				}}
			>
				<div
					style={{ display: "flex", flexDirection: "column", flex: 1, gap: 12 }}
				>
					<Text
						text={content.headline}
						size={50}
						weight={800}
						color="#ffffff"
						max={58}
					/>
					<Text
						text={content.highlight}
						size={(content.highlight?.length ?? 0) > 18 ? 44 : 66}
						weight={800}
						color={AMBER}
						max={48}
					/>
					<Stars content={content} size={44} />
					<Facts content={content} size={46} />
					<Byline content={content} size={48} />
					<Text
						text={content.place}
						size={28}
						weight={400}
						color={MUTED}
						max={34}
					/>
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						gap: 14,
					}}
				>
					<div
						style={{
							display: "flex",
							backgroundColor: "#ffffff",
							borderRadius: 16,
							padding: 10,
						}}
					>
						{/* biome-ignore lint/performance/noImgElement: a card is drawn by Satori, not the browser */}
						<img src={content.link.qr} width={190} height={190} alt="" />
					</div>
					<Brand logo={content.logo} size={36} />
				</div>
			</div>
		</div>
	);
}

export function cardElement(
	format: CardFormat,
	content: CardContent,
): ReactElement {
	if (format === "story") return Story(content);
	if (format === "square") return Square(content);
	return Preview(content);
}
