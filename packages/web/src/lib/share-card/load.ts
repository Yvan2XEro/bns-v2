import { getTranslations } from "next-intl/server";
import type { Locale } from "~/i18n/locales";
import { SERVER_API_URL } from "~/lib/api-origin";
import { withContentLocale } from "~/lib/content-locale";
import { kindPriceText } from "~/lib/listing-kind";
import { listingShop } from "~/lib/listing-shop";
import { renderOrderMoney } from "~/lib/order-money";
import { hasListingPrice } from "~/lib/price";
import { serverFetch } from "~/lib/server-api";
import { getMarket, getPublicShop } from "~/lib/server-shop";
import { shopUrl } from "~/lib/shop-url";
import type { Listing, User } from "~/types";
import { cardLogo, cardPhoto, cardQr } from "./assets";
import type { CardContent } from "./card";
import { CARD_FORMATS, type CardFormat, displayUrl } from "./formats";

const WEB_URL = (
	process.env.NEXT_PUBLIC_WEB_URL ?? "https://buynsellem.com"
).replace(/\/$/, "");

/** The box the photo fills in each format. */
const PHOTO_BOX: Record<CardFormat, { width: number; height: number }> = {
	story: { width: 936, height: 720 },
	og: { width: 630, height: 630 },
	square: { width: CARD_FORMATS.square.width, height: 620 },
};

/** A media URL the API serves, made absolute for the server to fetch. */
function mediaUrl(value: unknown): string | null {
	const url =
		value && typeof value === "object" && "url" in value
			? (value as { url?: unknown }).url
			: null;
	if (typeof url !== "string" || !url) return null;
	return url.startsWith("/") ? `${SERVER_API_URL}${url}` : url;
}

async function labels(locale: Locale) {
	const t = await getTranslations({ locale, namespace: "ShareCard" });
	return { cta: t("cta"), verified: t("verified") };
}

/**
 * A published listing's card, or null: a draft, a listing under review or a
 * sold one is not shared.
 */
export async function listingCard(
	id: string,
	format: CardFormat,
	locale: Locale,
): Promise<{ content: CardContent } | null> {
	const response = await serverFetch(
		withContentLocale(
			`/api/listings/${encodeURIComponent(id)}?depth=1`,
			locale,
		),
	);
	if (!response.ok) return null;
	const listing = (await response.json()) as Listing;
	if (listing.status !== "published") return null;

	const shop = listingShop(listing);
	const [market, publicShop, tKind] = await Promise.all([
		getMarket(),
		shop?.handle ? getPublicShop(shop.handle) : null,
		getTranslations({ locale, namespace: "ListingKind" }),
	]);
	const money = hasListingPrice(listing.price)
		? renderOrderMoney(market, listing.price, locale)
		: null;
	const seller =
		listing.seller && typeof listing.seller === "object"
			? (listing.seller as User)
			: null;
	const url = `${WEB_URL}/listing/${listing.id}`;
	const box = PHOTO_BOX[format];
	const [photo, shopLogo, logo, text] = await Promise.all([
		cardPhoto(mediaUrl(listing.images?.[0]?.image), box.width, box.height),
		publicShop ? cardPhoto(mediaUrl(publicShop.logo), 128, 128) : null,
		cardLogo(),
		labels(locale),
	]);

	return {
		content: {
			headline: listing.title,
			highlight: kindPriceText(money, listing, tKind) || null,
			byline: publicShop
				? {
						name: publicShop.name,
						logo: shopLogo,
						verified: Boolean(publicShop.badge),
					}
				: seller?.name
					? { name: seller.name, logo: null, verified: false }
					: null,
			place: listing.location || null,
			blurb: null,
			photo,
			// The id says nothing to a reader: the domain is printed, the QR
			// code carries the whole link.
			link: { display: displayUrl(WEB_URL), qr: cardQr(url) },
			labels: text,
			logo,
		},
	};
}

/** A shop's card, or null when the shop is not public. */
export async function shopCard(
	handle: string,
	format: CardFormat,
	locale: Locale,
): Promise<{ content: CardContent } | null> {
	const shop = await getPublicShop(handle);
	if (!shop) return null;
	const t = await getTranslations({ locale, namespace: "ShareCard" });
	const url = shopUrl(shop.handle);
	const box = PHOTO_BOX[format];
	const [photo, logo, text] = await Promise.all([
		cardPhoto(
			mediaUrl(shop.banner) ?? mediaUrl(shop.logo),
			box.width,
			box.height,
		),
		cardLogo(),
		labels(locale),
	]);
	const rating =
		shop.totalReviews > 0
			? t("rating", {
					rating: shop.rating.toLocaleString(locale, {
						maximumFractionDigits: 1,
					}),
					count: shop.totalReviews,
				})
			: null;
	const listings = t("listings", { count: shop.publishedListingCount });

	return {
		content: {
			headline: shop.name,
			highlight: rating ? `${rating} · ${listings}` : listings,
			byline: null,
			place: shop.location.city,
			blurb: shop.description,
			photo,
			link: { display: displayUrl(url), qr: cardQr(url) },
			labels: text,
			logo,
		},
	};
}
