import {
	BadgeCheck,
	Bookmark,
	Calendar,
	Info,
	MapPin,
	Settings,
	ShieldCheck,
	Star,
} from "lucide-react";
import Link from "next/link";
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
import { getAuthUser, serverFetch } from "~/lib/server-api";
import type { Listing, Review, User } from "~/types";
import { ProfileEditForm } from "./profile-edit-form";

async function getUserReviews(userId: string): Promise<Review[]> {
	try {
		const res = await serverFetch(`/api/reviews?userId=${userId}`);
		if (!res.ok) return [];
		return res.json();
	} catch {
		return [];
	}
}

async function getUserListings(userId: string): Promise<Listing[]> {
	try {
		const res = await serverFetch(
			`/api/public/search?userId=${userId}&limit=5`,
		);
		if (!res.ok) return [];
		const data = await res.json();
		return data.hits || [];
	} catch {
		return [];
	}
}

export default async function MyProfilePage() {
	const user = (await getAuthUser()) as User | null;
	if (!user) return null;

	const [reviews, listings] = await Promise.all([
		getUserReviews(user.id),
		getUserListings(user.id),
	]);

	const averageRating =
		reviews.length > 0
			? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
			: 0;

	return (
		<div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="font-bold text-2xl text-[#0F172A]">My Profile</h1>
				<Link href="/settings">
					<Button
						variant="outline"
						size="sm"
						className="rounded-xl border-[#E2E8F0]"
					>
						<Settings className="mr-2 h-4 w-4" />
						Account Settings
					</Button>
				</Link>
			</div>

			{!user.verified && (
				<div className="mb-6 flex items-center gap-3 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3">
					<Info className="h-5 w-5 shrink-0 text-[#1E40AF]" />
					<p className="text-[#1E40AF] text-sm">
						Verify your account to build trust with buyers.{" "}
						<Link
							href="/support"
							className="font-medium underline hover:text-[#1E3A8A]"
						>
							Contact support
						</Link>
					</p>
				</div>
			)}

			{user.verified && (
				<div className="mb-6 flex items-center gap-2 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3">
					<BadgeCheck className="h-5 w-5 shrink-0 text-[#16A34A]" />
					<p className="font-medium text-[#16A34A] text-sm">Verified Seller</p>
				</div>
			)}

			<Tabs defaultValue="profile">
				<TabsList>
					<TabsTrigger value="profile">Profile</TabsTrigger>
					<TabsTrigger value="listings">My Listings</TabsTrigger>
				</TabsList>

				<TabsContent value="profile">
					<div className="grid gap-6 lg:grid-cols-3">
						<div className="lg:col-span-2">
							<ProfileEditForm user={user} />
						</div>

						<div className="space-y-4 lg:col-span-1">
							<Card className="border-[#E2E8F0]">
								<CardHeader>
									<CardTitle className="text-[#0F172A]">
										Profile Preview
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex flex-col items-center text-center">
										<Avatar className="h-24 w-24 ring-2 ring-[#E2E8F0]">
											<AvatarImage
												src={(user.avatar as { url?: string })?.url}
											/>
											<AvatarFallback className="bg-[#1E40AF] font-semibold text-2xl text-white">
												{user.name?.charAt(0) || "?"}
											</AvatarFallback>
										</Avatar>
										<h2 className="mt-4 font-bold text-[#0F172A] text-xl">
											{user.name}
										</h2>
										{user.verified && (
											<Badge variant="secondary" className="mt-2">
												<ShieldCheck className="mr-1 h-3 w-3" />
												Verified
											</Badge>
										)}
										{user.location && (
											<p className="mt-2 flex items-center text-[#64748B] text-sm">
												<MapPin className="mr-1 h-4 w-4 text-[#F59E0B]" />
												{user.location}
											</p>
										)}
										<p className="mt-2 flex items-center text-[#64748B] text-sm">
											<Calendar className="mr-1 h-4 w-4" />
											Joined {new Date(user.createdAt).toLocaleDateString()}
										</p>
										<div className="mt-4 flex items-center gap-1">
											<Star className="h-5 w-5 fill-[#F59E0B] text-[#F59E0B]" />
											<span className="font-semibold text-[#0F172A]">
												{averageRating.toFixed(1)}
											</span>
											<span className="text-[#94A3B8]">
												({reviews.length} reviews)
											</span>
										</div>
										{user.bio && (
											<p className="mt-4 text-[#64748B] text-sm leading-relaxed">
												{user.bio}
											</p>
										)}
									</div>
								</CardContent>
							</Card>

							<Link
								href="/profile/me/searches"
								className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4 transition-colors hover:border-[#93C5FD] hover:bg-[#F8FAFC]"
							>
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF]">
									<Bookmark className="h-5 w-5 text-[#1E40AF]" />
								</div>
								<div>
									<p className="font-medium text-[#0F172A] text-sm">
										Saved Searches
									</p>
									<p className="text-[#64748B] text-xs">
										View and manage your saved searches
									</p>
								</div>
							</Link>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="listings">
					<Card className="border-[#E2E8F0]">
						<CardHeader>
							<CardTitle className="text-[#0F172A]">My Listings</CardTitle>
							<CardDescription>Manage your listings</CardDescription>
						</CardHeader>
						<CardContent>
							{listings.length > 0 ? (
								<div className="space-y-3">
									{listings.map((listing) => (
										<Link
											key={listing.id}
											href={`/listing/${listing.id}`}
											className="flex items-center justify-between rounded-xl border border-[#E2E8F0] p-4 transition-colors hover:bg-[#F8FAFC]"
										>
											<div>
												<p className="font-medium text-[#0F172A]">
													{listing.title}
												</p>
												<p className="text-[#64748B] text-sm">
													{listing.price.toLocaleString()} XAF •{" "}
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
									))}
									<Link
										href="/profile/me/listings"
										className="block pt-2 text-center font-medium text-[#1E40AF] text-sm hover:underline"
									>
										View all listings
									</Link>
								</div>
							) : (
								<div className="py-8 text-center">
									<p className="text-[#64748B]">No listings yet</p>
									<Link href="/create">
										<Button className="mt-3 rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A]">
											Create Your First Listing
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
