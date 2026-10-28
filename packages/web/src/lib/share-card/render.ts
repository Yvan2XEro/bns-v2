import { ImageResponse } from "next/og";
import { DEFAULT_LOCALE, isLocale, type Locale } from "~/i18n/locales";
import { getShareCardsEnabled } from "~/lib/server-shop";
import { cardFonts, cardJpeg } from "./assets";
import { type CardContent, cardElement } from "./card";
import { CARD_FORMATS, type CardFormat, isCardFormat } from "./formats";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Answers a card request: 404 while the feature is off (app-settings ›
 * Sharing), for an unknown format, or for a subject that is not public;
 * else the card as a JPEG. `maxAge`: a listing's card URL carries its
 * version (`?v=`), so an edit is a new URL and it keeps a day; a shop's
 * has none, so it keeps an hour.
 */
export async function cardResponse(
	request: Request,
	format: string,
	load: (
		format: CardFormat,
		locale: Locale,
	) => Promise<{ content: CardContent } | null>,
	maxAge: number,
): Promise<Response> {
	if (!isCardFormat(format) || !(await getShareCardsEnabled()))
		return notFound();
	const lang = new URL(request.url).searchParams.get("lang") ?? "";
	const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
	const card = await load(format, locale);
	if (!card) return notFound();

	const { width, height, maxBytes } = CARD_FORMATS[format];
	const png = await new ImageResponse(cardElement(format, card.content), {
		width,
		height,
		fonts: await cardFonts(),
	}).arrayBuffer();
	const jpeg = await cardJpeg(png, maxBytes);

	return new Response(new Uint8Array(jpeg), {
		headers: {
			"content-type": "image/jpeg",
			"content-length": String(jpeg.byteLength),
			"cache-control": `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=604800`,
		},
	});
}
