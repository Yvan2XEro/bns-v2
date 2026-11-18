import { Bookmark, Calendar, MapPin, Settings, Star } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { LevelBadge } from "~/components/shop/level-badge";
import { MyShopEntry } from "~/components/shop/my-shop-entry";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { withContentLocale } from "~/lib/content-locale";
import { renderOrderMoney } from "~/lib/order-money";
import { hasListingPrice } from "~/lib/price";
import {
	getAuthUser,
	serverContentLocale,
	serverFetch,
} from "~/lib/server-api";
import { getMarket, getMyShop, getShopsEnabled } from "~/lib/server-shop";
import type { Listing, Review, User } from "~/types";
import { AddressesEntry } from "./addresses-entry";
import { DisputesEntry } from "./disputes-entry";
import { ProfileEditForm } from "./profile-edit-form";
import { PurchasesEntry } from "./purchases-entry";
import { ReturnsEntry } from "./returns-entry";

async function getUserReviews(userId: string): Promise<Review[]> {
	try {
		const res = await serverFetch(
			`/api/reviews?where[reviewedUser][equals]=${userId}&depth=1&limit=50&sort=-createdAt`,
		);
		if (!res.ok) return [];
		const data = await res.json();
		return data.docs || [];
	} catch {
		return [];
	}
}

async function getUserListings(userId: string): Promise<Listing[]> {
	try {
		const res = await serverFetch(
			withContentLocale(
				`/api/listings?where[seller][equals]=${userId}&where[status][equals]=published&limit=5&sort=-createdAt&depth=1`,
				await serverContentLocale(),
			),
		);
		if (!res.ok) return [];
		const data = await res.json();
		return data.docs || [];
	} catch {
		return [];
	}
}

export default async function MyProfilePage() {
	const t = await getTranslations("Profile");
	const [locale, market] = await Promise.all([getLocale(), getMarket()]);
	const user = (await getAuthUser()) as User | null;
	if (!user) return null;

	const [reviews, listings, shopsEnabled, mine] = await Promise.all([
		getUserReviews(user.id),
		getUserListings(user.id),
		getShopsEnabled(),
		getMyShop(),
	]);

	const averageRating =
		reviews.length > 0
			? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
			: 0;

	return (
		<div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="font-bold text-2xl text-ink">{t("myProfile")}</h1>
				<Link href="/settings">
					<Button
						variant="outline"
						size="sm"
						className="rounded-xl border-line"
					>
						<Settings className="mr-2 h-4 w-4" />
						{t("accountSettings")}
					</Button>
				</Link>
			</div>

			{mine?.shop && (
				<div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
					<LevelBadge badge={mine.shop.badge} />
					<Link
						href="/seller/verification"
						className="font-medium text-brand text-sm hover:underline"
					>
						{t("increaseLevel")}
					</Link>
				</div>
			)}

			<Tabs defaultValue="profile">
				<TabsList>
					<TabsTrigger value="profile">{t("profileTab")}</TabsTrigger>
					<TabsTrigger value="listings">{t("listingsTab")}</TabsTrigger>
				</TabsList>

				<TabsContent value="profile">
					<div className="grid gap-6 lg:grid-cols-3">
						<div className="lg:col-span-2">
							<ProfileEditForm user={user} />
						</div>

						<div className="space-y-4 lg:col-span-1">
							<Card className="border-line">
								<CardHeader>
									<CardTitle className="text-ink">
										{t("profilePreview")}
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex flex-col items-center text-center">
										<Avatar className="h-24 w-24 ring-2 ring-line">
											<AvatarImage
												src={(user.avatar as { url?: string })?.url}
											/>
											<AvatarFallback className="bg-brand-fill font-semibold text-2xl text-white">
												{user.name?.charAt(0) || "?"}
											</AvatarFallback>
										</Avatar>
										<h2 className="mt-4 font-bold text-ink text-xl">
											{user.name}
										</h2>
										{user.location && (
											<p className="mt-2 flex items-center text-ink-muted text-sm">
												<MapPin className="mr-1 h-4 w-4 text-[#F59E0B]" />
												{user.location}
											</p>
										)}
										<p className="mt-2 flex items-center text-ink-muted text-sm">
											<Calendar className="mr-1 h-4 w-4" />
											{t("joined", {
												date: new Date(user.createdAt).toLocaleDateString(),
											})}
										</p>
										<div className="mt-4 flex items-center gap-1">
											<Star className="h-5 w-5 fill-[#F59E0B] text-[#F59E0B]" />
											<span className="font-semibold text-ink">
												{averageRating.toFixed(1)}
											</span>
											<span className="text-ink-faint">
												({t("userReviews", { count: reviews.length })})
											</span>
										</div>
										{user.bio && (
											<p className="mt-4 text-ink-muted text-sm leading-relaxed">
												{user.bio}
											</p>
										)}
									</div>
								</CardContent>
							</Card>

							<PurchasesEntry />
							<ReturnsEntry />
							<AddressesEntry />
							<DisputesEntry />

							<MyShopEntry mine={mine} shopsEnabled={shopsEnabled} />

							<Link
								href="/profile/me/searches"
								className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand-line hover:bg-canvas"
							>
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft">
									<Bookmark className="h-5 w-5 text-brand" />
								</div>
								<div>
									<p className="font-medium text-ink text-sm">
										{t("savedSearches")}
									</p>
									<p className="text-ink-muted text-xs">
										{t("viewAndManageSearches")}
									</p>
								</div>
							</Link>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="listings">
					<Card className="border-line">
						<CardHeader>
							<CardTitle className="text-ink">{t("listingsTab")}</CardTitle>
							<CardDescription>{t("manageListings")}</CardDescription>
						</CardHeader>
						<CardContent>
							{listings.length > 0 ? (
								<div className="space-y-3">
									{listings.map((listing) => {
										const formattedPrice = hasListingPrice(listing.price)
											? renderOrderMoney(market, listing.price, locale)
											: null;
										return (
											<Link
												key={listing.id}
												href={`/listing/${listing.id}`}
												className="flex items-center justify-between rounded-xl border border-line p-4 transition-colors hover:bg-canvas"
											>
												<div>
													<p className="font-medium text-ink">
														{listing.title}
													</p>
													<p className="text-ink-muted text-sm">
														{formattedPrice ? `${formattedPrice} • ` : ""}
														{listing.location}
													</p>
												</div>
												<Badge
													variant={
														listing.status === "published"
															? "default"
															: "secondary"
													}
												>
													{listing.status}
												</Badge>
											</Link>
										);
									})}
									<Link
										href="/profile/me/listings"
										className="block pt-2 text-center font-medium text-brand text-sm hover:underline"
									>
										{t("viewAllListings")}
									</Link>
								</div>
							) : (
								<div className="py-8 text-center">
									<p className="text-ink-muted">{t("noListingsYet")}</p>
									<Link href="/create">
										<Button className="mt-3 rounded-xl bg-brand-fill hover:bg-brand-strong">
											{t("createFirstListing")}
										</Button>
									</Link>
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
