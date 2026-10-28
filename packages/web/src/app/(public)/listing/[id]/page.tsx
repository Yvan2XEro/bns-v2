import {
	AlertTriangle,
	Clock,
	Eye,
	Flag,
	MapPin,
	Pencil,
	Shield,
	Star,
	Timer,
	Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { BackToResults } from "~/components/listing/back-to-results";
import { BoostDialog } from "~/components/listing/boost-dialog";
import { BoostStatusBanner } from "~/components/listing/boost-status-banner";
import { FavoriteButton } from "~/components/listing/favorite-button";
import { ImageGallery } from "~/components/listing/image-gallery";
import { ListingGrid } from "~/components/listing/listing-card";
import { MessageSellerButton } from "~/components/listing/message-seller-button";
import { PhoneReveal } from "~/components/listing/phone-reveal";
import { ReportDialog } from "~/components/listing/report-dialog";
import {
	ShareButton,
	WhatsAppShareButton,
} from "~/components/listing/share-button";
import { ShopSellerCard } from "~/components/listing/shop-seller-card";
import { ViewTracker } from "~/components/listing/view-tracker";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { DEFAULT_LOCALE, isLocale } from "~/i18n/locales";
import { IOS_APP_ID } from "~/lib/app-stores";
import { withContentLocale } from "~/lib/content-locale";
import { buildListingAttributeGroups } from "~/lib/listing-attributes";
import {
	adAction,
	isDraftAction,
	kindPriceText,
	listingKindRules,
	safetyKind,
} from "~/lib/listing-kind";
import {
	listingProduct,
	listingProductId,
	listingShop,
	productSummaryOf,
} from "~/lib/listing-shop";
import { listingStructuredData } from "~/lib/listing-structured-data";
import { formatOrderMoneyRange, renderOrderMoney } from "~/lib/order-money";
import { hasListingPrice } from "~/lib/price";
import { getAuthUser, serverFetch } from "~/lib/server-api";
import {
	getMarket,
	getMyShop,
	getPublicShop,
	getShareCardsEnabled,
} from "~/lib/server-shop";
import { cardPath } from "~/lib/share-card/formats";
import { timeAgo } from "~/lib/time-ago";
import type { Listing, Tag, User } from "~/types";
import { BuyBox } from "./buy-box";
import { DeliveryEstimates } from "./delivery-estimates";
import { ListingActionBar } from "./listing-action-bar";
import { SentBanner } from "./sent-banner";

export const revalidate = 3600;

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://buynsellem.com";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ boostStatus?: string }>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { id } = await params;
	const listing = await getListing(id);

	if (!listing) {
		const tMeta = await getTranslations("Listing");
		return {
			title: tMeta("metaNotFound"),
			robots: { index: false },
		};
	}

	const market = await getMarket();
	const title = hasListingPrice(listing.price)
		? `${listing.title} — ${renderOrderMoney(market, listing.price, await getLocale())}`
		: listing.title;
	const description = (listing.description ?? "")
		.slice(0, 155)
		.replace(/\n/g, " ");
	const canonical = `${WEB_URL}/listing/${id}`;
	const imageUrls = (listing.images ?? [])
		.map((img) => (img.image as { url?: string })?.url)
		.filter((u): u is string => Boolean(u));
	// The generated card (app-settings › Sharing) when it is on, sized for
	// every preview; else the listing's first photo, as before.
	const card =
		listing.status === "published" && (await getShareCardsEnabled())
			? `${WEB_URL}${cardPath({ kind: "listing", id }, "og", listing.updatedAt)}`
			: null;
	const firstImage = card ?? imageUrls[0];

	return {
		title,
		description,
		alternates: { canonical },
		// Safari's own app banner opens the app on this listing.
		itunes: { appId: IOS_APP_ID, appArgument: canonical },
		openGraph: {
			title,
			description,
			url: canonical,
			type: "website",
			...(firstImage && {
				images: [
					card
						? {
								url: card,
								width: 1200,
								height: 630,
								type: "image/jpeg",
								alt: listing.title,
							}
						: { url: firstImage, alt: listing.title },
				],
			}),
		},
		twitter: {
			card: firstImage ? "summary_large_image" : "summary",
			title,
			description,
			...(firstImage && { images: [firstImage] }),
		},
	};
}

async function getListing(id: string): Promise<Listing | null> {
	try {
		// depth=2 is Payload's default, but the attribute labels below depend on
		// `category` coming back populated, so say so rather than inherit it.
		// Payload's REST route takes the language from `?locale=` only.
		const locale = await getLocale();
		const res = await serverFetch(
			withContentLocale(
				`/api/listings/${id}?depth=2`,
				isLocale(locale) ? locale : DEFAULT_LOCALE,
			),
		);
		if (!res.ok) return null;
		return res.json();
	} catch {
		return null;
	}
}

async function isListingFavorited(listingId: string): Promise<boolean> {
	try {
		const res = await serverFetch(
			`/api/favorites?where[listing][equals]=${listingId}&limit=1`,
		);
		if (!res.ok) return false;
		const data = await res.json();
		return (data.docs?.length ?? 0) > 0;
	} catch {
		return false;
	}
}

async function getSimilarListings(listingId: string): Promise<Listing[]> {
	try {
		const res = await serverFetch(
			`/api/public/similar?id=${listingId}&limit=6`,
		);
		if (!res.ok) return [];
		const data = await res.json();
		return data.hits ?? [];
	} catch {
		return [];
	}
}

export default async function ListingPage({ params, searchParams }: PageProps) {
	const t = await getTranslations("Listing");
	const locale = await getLocale();
	const { id } = await params;
	const { boostStatus } = await searchParams;
	const [listing, isFavorited, similarListings, authUser] = await Promise.all([
		getListing(id),
		isListingFavorited(id),
		getSimilarListings(id),
		getAuthUser(),
	]);

	if (!listing) {
		notFound();
	}

	const isBoosted =
		listing.boostedUntil && new Date(listing.boostedUntil) > new Date();
	const seller = listing.seller as User | undefined;
	const shop = listingShop(listing);
	const [publicShop, mine, market] = await Promise.all([
		shop ? getPublicShop(shop.handle) : null,
		shop && authUser ? getMyShop() : null,
		getMarket(),
	]);
	const shopBadge = publicShop?.badge ?? null;
	const formatOrderMoney = (amount: number | null | undefined) =>
		renderOrderMoney(market, amount, locale);
	const formattedPrice = hasListingPrice(listing.price)
		? formatOrderMoney(listing.price)
		: null;
	const productId = listingProductId(listing);
	const product = listingProduct(listing);
	const summary = productSummaryOf(listing);
	const tKind = await getTranslations("ListingKind");
	const kindRules = listingKindRules(listing.kind);
	// Order for a shop product, else what the kind calls for: a visit, an
	// application, a quote.
	const action = adAction(listing, Boolean(productId));
	const tipsKind = productId ? null : safetyKind(listing.kind);
	const kindTips = tipsKind
		? (["tip1", "tip2", "tip3"] as const).map((tip) =>
				tKind(`safety.${tipsKind}.${tip}`),
			)
		: null;
	const delivery = product?.delivery ?? {};
	const warrantyMonths = product?.warrantyMonths ?? 0;
	const priceRange =
		summary &&
		summary.priceMin !== null &&
		summary.priceMax !== null &&
		summary.priceMin !== summary.priceMax
			? formatOrderMoneyRange(
					formatOrderMoney,
					summary.priceMin,
					summary.priceMax,
				)
			: null;
	const isOwner = !!(
		authUser &&
		seller &&
		String(authUser.id) === String(seller.id)
	);
	// The cart refuses any member of the listing's shop; the active shop is the
	// one membership known here, and the API's `checkout.selfPurchase` covers
	// a member viewing from another active shop.
	const ownShop = isOwner || (shop !== null && mine?.shop?.id === shop.id);
	const category = listing.category as { id: string; name: string } | undefined;
	const parentCategory =
		typeof listing.category === "object" &&
		listing.category?.parent &&
		typeof listing.category.parent === "object"
			? listing.category.parent
			: null;

	// Attribute slugs are meaningless to a buyer ("fuel_type"); the readable
	// name, type, unit and section all live on the category, so join the two.
	// `listing.category` is a relationship — a bare id string when unpopulated —
	// and the helper degrades to slugs rather than throwing on that.
	const attributeGroups = buildListingAttributeGroups(
		listing.attributes,
		listing.category,
		{ yes: t("yes"), no: t("no"), locale },
	);

	const expiresAt = listing.expiresAt ? new Date(listing.expiresAt) : null;
	const isExpired = expiresAt ? expiresAt <= new Date() : false;
	const daysUntilExpiry = expiresAt
		? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
		: null;
	const isActive =
		listing.status === "published" || listing.status === "pending";
	const money = priceRange ?? formattedPrice;
	// "150 000 / month" (in the market's currency), or the kind's own words for a missing price.
	const priceText = kindPriceText(money, listing, tKind);

	const imageUrls: string[] =
		listing.images
			?.map((img) => (img.image as { url?: string })?.url)
			.filter((url): url is string => Boolean(url)) || [];

	const rawTags = (
		listing as Listing & {
			tags?: Array<string | Tag>;
		}
	).tags;
	// Tags are scoped to categories, so a tag link searches within this one.
	const tagCategoryId =
		typeof listing.category === "string"
			? listing.category
			: listing.category?.id;
	const listingTags = Array.isArray(rawTags)
		? rawTags.filter(
				(tag): tag is Tag => typeof tag === "object" && tag !== null,
			)
		: [];

	const canonical = `${WEB_URL}/listing/${listing.id}`;
	const productJsonLd = listingStructuredData({
		kind: listing.kind,
		priceUnit: listing.priceUnit,
		title: listing.title,
		description: listing.description,
		url: canonical,
		images: imageUrls,
		price: hasListingPrice(listing.price) ? listing.price : null,
		currency: market?.currency.code ?? null,
		location: listing.location,
		createdAt: listing.createdAt,
		expiresAt: listing.expiresAt,
		// Search engines must not list an expired or sold-out item as buyable.
		available: isActive && !isExpired && summary?.available !== false,
		attributes:
			listing.attributes && typeof listing.attributes === "object"
				? (listing.attributes as Record<string, unknown>)
				: null,
		categoryName: category?.name ?? null,
		seller: shop
			? {
					type: "Organization",
					name: shop.name,
					url: `${WEB_URL}/s/${shop.handle}`,
				}
			: seller?.name
				? { type: "Person", name: seller.name }
				: null,
	});

	const breadcrumbJsonLd = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{
				"@type": "ListItem",
				position: 1,
				name: t("breadcrumbHome"),
				item: WEB_URL,
			},
			{
				"@type": "ListItem",
				position: 2,
				name: t("breadcrumbSearch"),
				item: `${WEB_URL}/search`,
			},
			...(category
				? [
						{
							"@type": "ListItem",
							position: 3,
							name: category.name,
							item: `${WEB_URL}/search?category=${category.id}`,
						},
						{
							"@type": "ListItem",
							position: 4,
							name: listing.title,
							item: canonical,
						},
					]
				: [
						{
							"@type": "ListItem",
							position: 3,
							name: listing.title,
							item: canonical,
						},
					]),
		],
	};

	return (
		<div className="min-h-screen bg-canvas">
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: structured data
				dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
			/>
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: structured data
				dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
			/>
			<ViewTracker listingId={listing.id} />
			{/* Breadcrumb */}
			<div className="border-line border-b bg-surface">
				<div className="container mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 text-ink-muted text-sm sm:px-6 lg:px-8">
					<BackToResults label={t("backToResults")} />
					{parentCategory && (
						<>
							<span>/</span>
							<Link
								href={`/search?category=${parentCategory.id}`}
								className="hover:text-brand"
							>
								{parentCategory.name}
							</Link>
						</>
					)}
					{category && (
						<>
							<span>/</span>
							<Link
								href={`/search?category=${category.id}`}
								className="text-ink hover:text-brand"
							>
								{category.name}
							</Link>
						</>
					)}
				</div>
			</div>

			<div className="container mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
				<BoostStatusBanner status={boostStatus} />
				{isOwner && (
					<Suspense fallback={null}>
						<SentBanner title={listing.title} />
					</Suspense>
				)}
				<div className="grid gap-6 lg:grid-cols-5">
					{/* Left: images + details (3 cols) */}
					<div className="lg:col-span-3">
						{/* Image gallery */}
						<div className="overflow-hidden rounded-xl border border-line bg-surface">
							<ImageGallery
								images={imageUrls}
								title={listing.title}
								isBoosted={!!isBoosted}
							/>
						</div>

						{/* Details card */}
						<div className="mt-4 rounded-xl border border-line bg-surface p-5">
							{/* Title + price */}
							<div className="flex items-start justify-between gap-4">
								<div>
									<h1 className="font-bold text-2xl text-ink">
										{listing.title}
									</h1>
									{/* On a large screen a shop product's price sits in the buy
									    box beside the photos; below it, the box comes after the
									    description, so the price stays under the title. */}
									<p
										className={`mt-1 font-bold text-2xl text-brand ${productId ? "lg:hidden" : ""}`}
									>
										{priceText}
									</p>
								</div>
								<div className="flex gap-2">
									<FavoriteButton
										listingId={listing.id}
										initialFavorite={isFavorited}
										className="h-9 w-9 rounded-lg border border-line"
									/>
									<WhatsAppShareButton title={listing.title} />
									<ShareButton title={listing.title} />
								</div>
							</div>

							{/* Meta */}
							<div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-ink-muted text-sm">
								<span className="flex items-center gap-1">
									<MapPin className="h-4 w-4 text-[#F59E0B]" />
									{listing.location}
								</span>
								<span className="flex items-center gap-1">
									<Clock className="h-4 w-4" />
									{timeAgo(listing.createdAt, locale, { maxDays: 30 })}
								</span>
								{typeof listing.views === "number" && (
									<span className="flex items-center gap-1">
										<Eye className="h-4 w-4" />
										{t("viewCount", { count: listing.views })}
									</span>
								)}
								{expiresAt &&
									isActive &&
									!isExpired &&
									daysUntilExpiry !== null && (
										<span
											className={`flex items-center gap-1 ${daysUntilExpiry <= 5 ? "text-amber-600" : "text-ink-muted"}`}
										>
											<Timer className="h-4 w-4" />
											{daysUntilExpiry <= 1
												? t("expiresToday")
												: t("expiresIn", { days: daysUntilExpiry })}
										</span>
									)}
								{listing.status === "sold" && (
									<span className="flex items-center gap-1 font-semibold text-ink">
										{tKind(`closedAs.${kindRules.closedAs}`)}
									</span>
								)}
								{listing.status === "expired" && (
									<span className="flex items-center gap-1 text-red-500">
										<AlertTriangle className="h-4 w-4" />
										{t("listingExpired")}
									</span>
								)}
							</div>

							{/* Badges */}
							<div className="mt-4 flex flex-wrap gap-2">
								{category && <Badge variant="secondary">{category.name}</Badge>}
								{warrantyMonths > 0 && (
									<Badge className="border-transparent bg-warn-soft text-warn-ink hover:bg-warn-soft">
										{t("shopWarranty", { months: warrantyMonths })}
									</Badge>
								)}
								{isBoosted && (
									<Badge variant="boost">
										<Zap className="mr-1 h-3 w-3" />
										{t("listingBoosted")}
									</Badge>
								)}
								{listingTags.map((tag) => (
									<Link
										key={String(tag.id ?? tag.slug ?? tag.name)}
										href={`/search?${new URLSearchParams({
											...(tagCategoryId ? { category: tagCategoryId } : {}),
											tags: tag.slug ?? "",
										}).toString()}`}
									>
										<Badge
											variant="outline"
											className="cursor-pointer border-primary/30 bg-primary/5 text-primary hover:bg-primary/15"
										>
											{tag.emoji && <span className="mr-1">{tag.emoji}</span>}
											{tag.name ?? tag.slug}
										</Badge>
									</Link>
								))}
							</div>

							{/* Description */}
							<div className="mt-6 border-line border-t pt-5">
								<h2 className="mb-2 font-bold text-[17px] text-ink">
									{t("listingDescription")}
								</h2>
								<p className="whitespace-pre-wrap text-[15px] text-ink-soft leading-6">
									{listing.description}
								</p>
							</div>

							{/* Attributes */}
							{attributeGroups.length > 0 && (
								<div className="mt-6 border-line border-t pt-5">
									<h2 className="mb-2 font-bold text-[17px] text-ink">
										{t("details")}
									</h2>
									{attributeGroups.map((group) => (
										<div key={group.key} className="mb-4 last:mb-0">
											{group.title && (
												<h3 className="mb-2 font-semibold text-ink-faint text-xs uppercase tracking-wider">
													{group.title}
												</h3>
											)}
											<dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
												{group.items.map((attr) => (
													<div
														key={attr.slug}
														className="flex justify-between gap-4 border-subtle border-b py-2.5 text-sm"
													>
														<dt className="text-ink-muted">{attr.label}</dt>
														<dd className="text-right font-semibold text-ink">
															{attr.value}
														</dd>
													</div>
												))}
											</dl>
										</div>
									))}
								</div>
							)}
						</div>
					</div>

					{/* Right: buy box and seller card (2 cols) */}
					<div className="lg:col-span-2">
						<div className="sticky top-20 space-y-4">
							{/* Buy box first, as in the design: price, variants and the
							    order action sit at the top of the column, above the seller. */}
							{productId && (
								<div
									id="buy-box"
									className="scroll-mt-24 rounded-xl border border-line bg-surface p-[22px]"
								>
									<BuyBox
										listingId={String(listing.id)}
										productId={productId}
										shop={
											shop
												? {
														id: shop.id,
														restricted: Boolean(shop.ordersRestrictedAt),
													}
												: null
										}
										orderable={listing.orderable}
										ownShop={ownShop}
										productAvailable={summary?.available ?? null}
										signedIn={Boolean(authUser)}
										codAllowed={delivery.codAllowed === true}
										pickupAllowed={delivery.pickupAllowed === true}
										shopBadge={shopBadge}
										priceFallback={priceText}
										handlingHours={delivery.handlingHours ?? null}
										ask={
											!isOwner && (
												<MessageSellerButton
													listingId={String(listing.id)}
													signedIn={Boolean(authUser)}
													secondary
												/>
											)
										}
										delivery={{
											city: shop?.location?.city ?? null,
											sellerDeliveryEnabled:
												shop?.orderSettings?.sellerDeliveryEnabled === true,
											deliveryFee: shop?.orderSettings?.deliveryFee ?? null,
											pickupEnabled:
												shop?.orderSettings?.pickupEnabled === true,
											pickupAddress:
												shop?.orderSettings?.pickupPoint?.address ?? null,
										}}
									/>
									<DeliveryEstimates
										listingId={String(listing.id)}
										eligible={Boolean(shop && !shop.ordersRestrictedAt)}
									/>
								</div>
							)}
							{/* Seller card */}
							<div className="rounded-xl border border-line bg-surface p-5">
								{shop ? (
									<ShopSellerCard
										shop={shop}
										badge={shopBadge}
										brandColor={publicShop?.brandColor ?? null}
										ownerName={seller?.name ?? null}
										stats={
											publicShop && {
												rating: publicShop.rating,
												totalReviews: publicShop.totalReviews,
												productCount: publicShop.publishedListingCount,
												createdAt: publicShop.createdAt,
											}
										}
									/>
								) : seller ? (
									<Link
										href={`/profile/${seller.id}`}
										className="flex items-center gap-3"
									>
										<Avatar className="h-12 w-12 ring-2 ring-line">
											<AvatarImage
												src={
													(seller.avatar as { url?: string })?.url || undefined
												}
											/>
											<AvatarFallback className="bg-brand-fill font-semibold text-sm text-white">
												{seller.name?.charAt(0) || "?"}
											</AvatarFallback>
										</Avatar>
										<div>
											<p className="font-semibold text-ink">{seller.name}</p>
											{/* No stars before the first review: "0.0 (0)" reads as a bad score. */}
											{typeof seller.rating === "number" &&
												(seller.totalReviews ?? 0) > 0 && (
													<div className="flex items-center gap-1 text-ink-muted text-sm">
														<Star className="h-3.5 w-3.5 fill-[#F59E0B] text-[#F59E0B]" />
														{seller.rating.toFixed(1)}
														<span className="text-ink-faint">
															({seller.totalReviews})
														</span>
													</div>
												)}
										</div>
									</Link>
								) : (
									<p className="text-ink-muted text-sm">{t("unknownSeller")}</p>
								)}

								<div
									id="contact-seller"
									className="mt-5 flex scroll-mt-24 flex-col gap-2"
								>
									{isOwner && (
										<Link
											href={`/listing/${listing.id}/edit`}
											className="w-full"
										>
											<Button
												variant="outline"
												className="w-full rounded-lg border-line hover:border-brand hover:text-brand"
											>
												<Pencil className="mr-2 h-4 w-4" />
												{t("editThisListing")}
											</Button>
										</Link>
									)}
									{/* Boosting is the seller's business: a buyer never sees it. */}
									{isOwner && listing.status === "published" && !isBoosted && (
										<BoostDialog listingId={listing.id}>
											<Button className="w-full rounded-lg bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] font-bold text-ink shadow-amber-500/20 shadow-md hover:shadow-lg">
												<Zap className="mr-2 h-4 w-4" />
												{t("boostThisListing")}
											</Button>
										</BoostDialog>
									)}
									{isOwner && isBoosted && (
										<div className="flex items-center justify-center gap-1.5 rounded-lg border border-[#F59E0B]/30 bg-amber-50 px-3 py-2 font-semibold text-sm text-warn-ink">
											<Zap className="h-4 w-4 fill-[#F59E0B] text-[#F59E0B]" />
											{t("currentlyBoosted")}
										</div>
									)}
									{!isOwner && !productId && isActive && !isExpired && (
										<MessageSellerButton
											listingId={String(listing.id)}
											signedIn={Boolean(authUser)}
											intent={isDraftAction(action) ? action : undefined}
										/>
									)}
									{!isOwner && seller && isActive && !isExpired && (
										<PhoneReveal
											listingId={String(listing.id)}
											listingTitle={listing.title}
											signedIn={Boolean(authUser)}
										/>
									)}
									<FavoriteButton
										listingId={listing.id}
										initialFavorite={isFavorited}
										showLabel
										className="w-full"
									/>
								</div>
							</div>

							{/* Safety tips */}
							<div className="rounded-xl border border-line bg-canvas p-4">
								<div className="flex items-center gap-2 font-semibold text-ink text-sm">
									<Shield className="h-4 w-4 text-brand" />
									{t("safetyTips")}
								</div>
								{/* A shop product is paid through the platform, so "never
								    send money in advance" would contradict its pay button. */}
								<ul className="mt-2 space-y-1 text-ink-muted text-xs">
									{productId ? (
										<>
											<li>{t("safetyShopTip1")}</li>
											<li>{t("safetyShopTip2")}</li>
											<li>{t("safetyShopTip3")}</li>
										</>
									) : kindTips ? (
										// A rental's deposit scam, a job's "pay to apply": the
										// risks differ from buying a thing.
										kindTips.map((tip) => <li key={tip}>{tip}</li>)
									) : (
										<>
											<li>{t("safetyTip1")}</li>
											<li>{t("safetyTip2")}</li>
											<li>{t("safetyTip3")}</li>
										</>
									)}
								</ul>
							</div>

							{/* Report */}
							<div className="text-center">
								<ReportDialog
									targetType="listing"
									targetId={String(listing.id)}
								>
									<button
										type="button"
										className="inline-flex items-center gap-1 text-ink-faint text-xs hover:text-red-500"
									>
										<Flag className="h-3 w-3" />
										{t("reportThisListing")}
									</button>
								</ReportDialog>
							</div>
						</div>
					</div>
				</div>

				{!isOwner &&
					!ownShop &&
					isActive &&
					!isExpired &&
					(productId || seller) && (
						<ListingActionBar
							price={money ? priceText : null}
							action={action}
							targetId={productId ? "buy-box" : "contact-seller"}
						/>
					)}

				{/* Similar Listings */}
				{similarListings.length > 0 && (
					<div className="mt-8">
						<h2 className="mb-4 font-bold text-ink text-xl">
							{t("similarListings")}
						</h2>
						<ListingGrid listings={similarListings} />
					</div>
				)}
			</div>
		</div>
	);
}
