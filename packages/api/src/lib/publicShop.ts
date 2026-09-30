import type { BusinessType } from "../collections/VerificationRequests";
import type { Category, Media, Shop, User } from "../payload-types";
import { relationId } from "./relationId";
import { type ShopCapabilities, shopCapabilities } from "./shopCapabilities";

export interface MediaRef {
	id: string;
	url: string | null;
	thumbnailURL: string | null;
	alt: string | null;
}

/**
 * The `legal` group as declared by the shop (below level 3) or reviewed and
 * pinned by a reviewer (at level 3) — see `Shops.ts`'s `legal` field. Public
 * on purpose: `verifiedAt` is what tells a buyer "declared" from "verified".
 */
export interface PublicShopLegal {
	businessType: BusinessType | null;
	legalName: string | null;
	rccmNumber: string | null;
	niu: string | null;
	verifiedAt: string | null;
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
	badge: ShopCapabilities["badge"];
	/**
	 * The capability itself, read the same way `badge` is — never left for a
	 * caller to infer from `legal.verifiedAt`, which is a row that can outlive
	 * the level that earned it until a recompute clears it. `legal.verifiedAt`
	 * still ships for record-keeping; this is the field a client may label
	 * "Verified" from.
	 */
	legalVerified: boolean;
	legal: PublicShopLegal | null;
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

function toPublicShopLegal(shop: Shop): PublicShopLegal | null {
	const legal = shop.legal;
	if (!legal) return null;
	return {
		businessType: legal.businessType ?? null,
		legalName: str(legal.legalName),
		rccmNumber: str(legal.rccmNumber),
		niu: str(legal.niu),
		verifiedAt: str(legal.verifiedAt),
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
		badge: shopCapabilities(shop).badge,
		legalVerified: shopCapabilities(shop).legalInfoVerified,
		legal: toPublicShopLegal(shop),
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
	badge: ShopCapabilities["badge"];
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
	const level = typeof doc.level === "number" ? doc.level : 1;
	// The index only ever carries an active shop's document, and the payload
	// fallback path filters to `status: active` before mapping — so a hit with
	// no `status` field (the indexed shape) is hydrated as active here, and one
	// that does carry it (a populated Shop) is trusted as given.
	const status = typeof doc.status === "string" ? doc.status : "active";
	return {
		id: String(doc.id ?? ""),
		handle: String(doc.handle ?? ""),
		name: String(doc.name ?? ""),
		description: str(doc.description),
		city: str(doc.city) ?? str(location?.city),
		level,
		badge: shopCapabilities({
			status,
			level,
			levelExpiresAt:
				typeof doc.levelExpiresAt === "string" ? doc.levelExpiresAt : null,
		}).badge,
		publishedListingCount: Number(doc.publishedListingCount ?? 0),
		logoUrl: str(doc.logoUrl) ?? str(logo?.url),
		ownerRating: Number(doc.ownerRating ?? owner?.rating ?? 0),
		ownerReviews: Number(doc.ownerReviews ?? owner?.totalReviews ?? 0),
		createdAt: String(doc.createdAt ?? ""),
	};
}
