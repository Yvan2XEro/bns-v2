import type { Category, Media, Shop, User } from "../payload-types";
import { relationId } from "./relationId";

export interface MediaRef {
	id: string;
	url: string | null;
	thumbnailURL: string | null;
	alt: string | null;
}

export interface PublicShop {
	id: string;
	handle: string;
	name: string;
	description: string | null;
	logo: MediaRef | null;
	banner: MediaRef | null;
	contact: {
		phone: string | null;
		whatsapp: string | null;
		email: string | null;
	};
	location: {
		city: string | null;
		region: string | null;
		country: string | null;
		countryCode: string | null;
	};
	categories: { id: string; name: string; slug: string }[];
	level: number;
	publishedListingCount: number;
	createdAt: string;
	owner: {
		id: string;
		name: string;
		avatar: MediaRef | null;
		rating: number;
		totalReviews: number;
		memberSince: string;
	};
}

const str = (value: unknown): string | null =>
	typeof value === "string" && value.length > 0 ? value : null;

/** A relation resolved to its document rather than left as a bare id. */
function populated<T>(value: string | T | null | undefined): T | null {
	return value && typeof value === "object" ? (value as T) : null;
}

export function toMediaRef(
	value: string | Media | null | undefined,
): MediaRef | null {
	const media = populated(value);
	if (!media) return null;
	return {
		id: media.id,
		url: str(media.url),
		thumbnailURL: str(media.thumbnailURL),
		alt: str(media.alt),
	};
}

export function serializePublicShop(
	shop: Shop,
	owner: User | null,
): PublicShop {
	return {
		id: shop.id,
		handle: shop.handle,
		name: shop.name,
		description: str(shop.description),
		logo: toMediaRef(shop.logo),
		banner: toMediaRef(shop.banner),
		contact: {
			phone: str(shop.contact?.phone),
			whatsapp: str(shop.contact?.whatsapp),
			email: str(shop.contact?.email),
		},
		location: {
			city: str(shop.location?.city),
			region: str(shop.location?.region),
			country: str(shop.location?.country),
			countryCode: str(shop.location?.countryCode),
		},
		categories: (shop.categories ?? [])
			.map((category) => populated<Category>(category))
			.filter((category): category is Category => category !== null)
			.map((category) => ({
				id: category.id,
				name: category.name,
				slug: category.slug,
			})),
		level: shop.level ?? 1,
		publishedListingCount: shop.publishedListingCount ?? 0,
		createdAt: shop.createdAt,
		owner: {
			id: relationId(owner) ?? relationId(shop.owner) ?? "",
			name: owner?.name ?? "",
			avatar: toMediaRef(owner?.avatar),
			rating: owner?.rating ?? 0,
			totalReviews: owner?.totalReviews ?? 0,
			memberSince: owner?.createdAt ?? "",
		},
	};
}

type Doc = Record<string, unknown>;

export interface ShopSearchHit {
	id: string;
	handle: string;
	name: string;
	description: string | null;
	city: string | null;
	level: number;
	publishedListingCount: number;
	logoUrl: string | null;
	ownerRating: number;
	ownerReviews: number;
	createdAt: string;
}

/**
 * Accepts the indexer's shop document or a Payload shop populated at depth
 * 1 — takes `unknown` so a caller passes its `Shop`/hit value straight
 * through, with no cast of its own to keep correct at each call site.
 */
export function toShopSearchHit(input: unknown): ShopSearchHit {
	const doc = (input ?? {}) as Doc;
	const owner =
		doc.owner && typeof doc.owner === "object" ? (doc.owner as Doc) : null;
	const location =
		doc.location && typeof doc.location === "object"
			? (doc.location as Doc)
			: null;
	const logo =
		doc.logo && typeof doc.logo === "object" ? (doc.logo as Doc) : null;
	return {
		id: String(doc.id ?? ""),
		handle: String(doc.handle ?? ""),
		name: String(doc.name ?? ""),
		description: str(doc.description),
		city: str(doc.city) ?? str(location?.city),
		level: typeof doc.level === "number" ? doc.level : 1,
		publishedListingCount: Number(doc.publishedListingCount ?? 0),
		logoUrl: str(doc.logoUrl) ?? str(logo?.url),
		ownerRating: Number(doc.ownerRating ?? owner?.rating ?? 0),
		ownerReviews: Number(doc.ownerReviews ?? owner?.totalReviews ?? 0),
		createdAt: String(doc.createdAt ?? ""),
	};
}
