import {
	BadgeCheck,
	Calendar,
	Flag,
	MapPin,
	MessageCircle,
	Star,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingGrid } from "~/components/listing/listing-card";
import { ReportDialog } from "~/components/listing/report-dialog";
import { ReviewForm } from "~/components/listing/review-form";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { getAuthUser, serverFetch } from "~/lib/server-api";
import type { Listing, Review, User } from "~/types";

interface PageProps {
	params: Promise<{ userId: string }>;
}

async function getUser(userId: string): Promise<User | null> {
	try {
		const res = await serverFetch(`/api/users/${userId}`);
		if (!res.ok) return null;
		return res.json();
	} catch {
		return null;
	}
}

async function getUserListings(userId: string): Promise<Listing[]> {
	try {
		const res = await serverFetch(
			`/api/public/search?userId=${userId}&limit=20`,
		);
		if (!res.ok) return [];
		const data = await res.json();
		return data.hits || [];
	} catch {
		return [];
	}
}

async function getUserReviews(userId: string): Promise<Review[]> {
	try {
		const res = await serverFetch(`/api/reviews?userId=${userId}`);
		if (!res.ok) return [];
		return res.json();
	} catch {
		return [];
	}
}

export default async function ProfilePage({ params }: PageProps) {
	const { userId } = await params;
	const [user, listings, reviews] = await Promise.all([
		getUser(userId),
		getUserListings(userId),
		getUserReviews(userId),
	]);
	const currentUser = (await getAuthUser()) as { id: string } | null;

	if (!user) {
		notFound();
	}

	const averageRating =
		reviews.length > 0
			? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
			: 0;

	return (
		<div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<div className="grid gap-6 lg:grid-cols-3">
				{/* Seller card */}
				<div className="lg:col-span-1">
					<div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
						<div className="flex flex-col items-center text-center">
							<Avatar className="h-24 w-24 ring-2 ring-[#E2E8F0]">
								<AvatarImage src={(user.avatar as { url?: string })?.url} />
								<AvatarFallback className="bg-[#1E40AF] font-semibold text-2xl text-white">
									{user.name?.charAt(0) || "?"}
								</AvatarFallback>
							</Avatar>
							<div className="mt-4 flex items-center gap-2">
								<h1 className="font-bold text-2xl text-[#0F172A]">
									{user.name}
								</h1>
								{user.verified && (
									<BadgeCheck className="h-6 w-6 text-[#16A34A]" />
								)}
							</div>
							{user.verified && (
								<Badge
									variant="secondary"
									className="mt-2 border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]"
								>
									Verified Seller
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

							<div className="mt-5 w-full border-[#E2E8F0] border-t pt-5">
								<Link href={"/messages?listing="}>
									<Button className="w-full rounded-xl bg-[#1E40AF] hover:bg-[#1E3A8A]">
										<MessageCircle className="mr-2 h-4 w-4" />
										Message
									</Button>
								</Link>
							</div>
							<div className="mt-4 text-center">
								<ReportDialog targetType="user" targetId={String(user.id)}>
									<button
										type="button"
										className="inline-flex items-center gap-1 text-[#94A3B8] text-xs hover:text-red-500"
									>
										<Flag className="h-3 w-3" />
										Report this user
									</button>
								</ReportDialog>
							</div>
						</div>
					</div>
				</div>

				{/* Listings + Reviews */}
				<div className="space-y-8 lg:col-span-2">
					<div>
						<h2 className="mb-4 font-bold text-[#0F172A] text-xl">
							Listings by {user.name}
						</h2>
						{listings.length > 0 ? (
							<ListingGrid listings={listings} />
						) : (
							<div className="rounded-xl border border-[#E2E8F0] bg-white py-12 text-center">
								<p className="text-[#64748B]">No listings yet</p>
							</div>
						)}
					</div>

					{reviews.length > 0 && (
						<div>
							<h2 className="mb-4 font-bold text-[#0F172A] text-xl">Reviews</h2>
							<div className="space-y-3">
								{reviews.map((review) => {
									const reviewer = review.reviewer as User;
									return (
										<div
											key={review.id}
											className="rounded-xl border border-[#E2E8F0] bg-white p-4"
										>
											<div className="flex items-center gap-3">
												<Avatar className="h-8 w-8">
													<AvatarImage
														src={(reviewer?.avatar as { url?: string })?.url}
													/>
													<AvatarFallback className="bg-[#1E40AF] font-semibold text-white text-xs">
														{reviewer?.name?.charAt(0) || "?"}
													</AvatarFallback>
												</Avatar>
												<div>
													<p className="font-medium text-[#0F172A]">
														{reviewer?.name || "Unknown"}
													</p>
													<div className="flex items-center">
														{[...Array(5)].map((_, i) => (
															<Star
																key={i}
																className={`h-3.5 w-3.5 ${
																	i < review.rating
																		? "fill-[#F59E0B] text-[#F59E0B]"
																		: "text-[#E2E8F0]"
																}`}
															/>
														))}
													</div>
												</div>
											</div>
											{review.comment && (
												<p className="mt-2 text-[#64748B] text-sm leading-relaxed">
													{review.comment}
												</p>
											)}
										</div>
									);
								})}
							</div>
						</div>
					)}

					{/* Review form - only show if logged in and not own profile */}
					{currentUser && currentUser.id !== user.id && (
						<ReviewForm reviewedUserId={user.id} />
					)}
				</div>
			</div>
		</div>
	);
}
