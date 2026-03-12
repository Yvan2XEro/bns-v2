import { Calendar, MapPin, Settings, ShieldCheck, Star } from "lucide-react";
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
		<div className="container mx-auto px-4 py-8">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="font-bold text-3xl">My Profile</h1>
				<Link href="/settings">
					<Button variant="outline" size="sm">
						<Settings className="mr-2 h-4 w-4" />
						Account Settings
					</Button>
				</Link>
			</div>

			<Tabs defaultValue="profile">
				<TabsList>
					<TabsTrigger value="profile">Profile</TabsTrigger>
					<TabsTrigger value="listings">My Listings</TabsTrigger>
				</TabsList>

				<TabsContent value="profile">
					<div className="grid gap-8 lg:grid-cols-3">
						<div className="lg:col-span-2">
							<ProfileEditForm user={user} />
						</div>

						<div className="lg:col-span-1">
							<Card>
								<CardHeader>
									<CardTitle>Profile Preview</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="flex flex-col items-center text-center">
										<Avatar className="h-24 w-24">
											<AvatarImage
												src={(user.avatar as { url?: string })?.url}
											/>
											<AvatarFallback className="text-2xl">
												{user.name?.charAt(0) || "?"}
											</AvatarFallback>
										</Avatar>
										<h2 className="mt-4 font-bold text-xl">{user.name}</h2>
										{user.verified && (
											<Badge variant="secondary" className="mt-2">
												<ShieldCheck className="mr-1 h-3 w-3" />
												Verified
											</Badge>
										)}
										{user.location && (
											<p className="mt-2 flex items-center text-muted-foreground text-sm">
												<MapPin className="mr-1 h-4 w-4" />
												{user.location}
											</p>
										)}
										<p className="mt-2 flex items-center text-muted-foreground text-sm">
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
											<p className="mt-4 text-muted-foreground text-sm">
												{user.bio}
											</p>
										)}
									</div>
								</CardContent>
							</Card>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="listings">
					<Card>
						<CardHeader>
							<CardTitle>My Listings</CardTitle>
							<CardDescription>Manage your listings</CardDescription>
						</CardHeader>
						<CardContent>
							{listings.length > 0 ? (
								<div className="space-y-4">
									{listings.map((listing) => (
										<div
											key={listing.id}
											className="flex items-center justify-between rounded-lg border p-4"
										>
											<div>
												<p className="font-medium">{listing.title}</p>
												<p className="text-muted-foreground text-sm">
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
										</div>
									))}
								</div>
							) : (
								<p className="text-muted-foreground">No listings yet</p>
							)}
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
