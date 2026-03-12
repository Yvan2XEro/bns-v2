import {
	Calendar,
	MapPin,
	MessageCircle,
	ShieldCheck,
	Star,
} from "lucide-react";
import { notFound } from "next/navigation";
import { ListingGrid } from "~/components/listing/listing-card";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { serverFetch } from "~/lib/server-api";
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

	if (!user) {
		notFound();
	}

	const averageRating =
		reviews.length > 0
			? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
			: 0;

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="grid gap-8 lg:grid-cols-3">
				<div className="lg:col-span-1">
					<div className="rounded-lg border p-6">
						<div className="flex flex-col items-center text-center">
							<Avatar className="h-24 w-24">
								<AvatarImage src={(user.avatar as { url?: string })?.url} />
								<AvatarFallback className="text-2xl">
									{user.name?.charAt(0) || "?"}
								</AvatarFallback>
							</Avatar>
							<h1 className="mt-4 text-2xl font-bold">{user.name}</h1>
							{user.verified && (
								<Badge variant="secondary" className="mt-2">
									<ShieldCheck className="mr-1 h-3 w-3" />
									Verified
								</Badge>
							)}
							{user.location && (
								<p className="mt-2 flex items-center text-sm text-muted-foreground">
									<MapPin className="mr-1 h-4 w-4" />
									{user.location}
								</p>
							)}
							<p className="mt-2 flex items-center text-sm text-muted-foreground">
								<Calendar className="mr-1 h-4 w-4" />
								Joined {new Date(user.createdAt).toLocaleDateString()}
							</p>

							<div className="mt-4 flex items-center gap-1">
								<Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
								<span className="font-semibold">
									{averageRating.toFixed(1)}
								</span>
								<span className="text-muted-foreground">
									({reviews.length} reviews)
								</span>
							</div>

							{user.bio && (
								<p className="mt-4 text-sm text-muted-foreground">{user.bio}</p>
							)}

							<Separator className="my-4" />

							<div className="w-full space-y-2">
								<Button className="w-full">
									<MessageCircle className="mr-2 h-4 w-4" />
									Message
								</Button>
							</div>
						</div>
					</div>
				</div>

				<div className="lg:col-span-2">
					<h2 className="mb-4 text-xl font-semibold">
						Listings by {user.name}
					</h2>
					{listings.length > 0 ? (
						<ListingGrid listings={listings} />
					) : (
						<p className="text-muted-foreground">No listings yet</p>
					)}

					{reviews.length > 0 && (
						<>
							<Separator className="my-8" />
							<h2 className="mb-4 text-xl font-semibold">Reviews</h2>
							<div className="space-y-4">
								{reviews.map((review) => {
									const reviewer = review.reviewer as User;
									return (
										<div key={review.id} className="rounded-lg border p-4">
											<div className="flex items-center gap-3">
												<Avatar className="h-8 w-8">
													<AvatarImage
														src={(reviewer?.avatar as { url?: string })?.url}
													/>
													<AvatarFallback>
														{reviewer?.name?.charAt(0) || "?"}
													</AvatarFallback>
												</Avatar>
												<div>
													<p className="font-medium">
														{reviewer?.name || "Unknown"}
													</p>
													<div className="flex items-center">
														{[...Array(5)].map((_, i) => (
															<Star
																key={i}
																className={`h-4 w-4 ${
																	i < review.rating
																		? "fill-yellow-400 text-yellow-400"
																		: "text-muted"
																}`}
															/>
														))}
													</div>
												</div>
											</div>
											{review.comment && (
												<p className="mt-2 text-sm text-muted-foreground">
													{review.comment}
												</p>
											)}
										</div>
									);
								})}
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
