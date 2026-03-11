import {
	ArrowLeft,
	Calendar,
	Eye,
	Flag,
	Heart,
	MapPin,
	MessageCircle,
	Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportDialog } from "~/components/listing/report-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { serverFetch } from "~/lib/server-api";
import type { Listing, User } from "~/types";

interface PageProps {
	params: Promise<{ id: string }>;
}

async function getListing(id: string): Promise<Listing | null> {
	try {
		const res = await serverFetch(`/api/listings/${id}`);
		if (!res.ok) return null;
		return res.json();
	} catch {
		return null;
	}
}

export default async function ListingPage({ params }: PageProps) {
	const { id } = await params;
	const listing = await getListing(id);

	if (!listing) {
		notFound();
	}

	const isBoosted =
		listing.boostedUntil && new Date(listing.boostedUntil) > new Date();
	const seller = listing.seller as User | undefined;
	const category = listing.category as { id: number; name: string } | undefined;

	const imageUrls: string[] =
		listing.images
			?.map((img) => (img.image as { url?: string })?.url)
			.filter((url): url is string => Boolean(url)) || [];

	return (
		<div className="container mx-auto px-4 py-8">
			<Link href="/search">
				<Button variant="ghost" size="sm" className="mb-4">
					<ArrowLeft className="mr-2 h-4 w-4" />
					Back to search
				</Button>
			</Link>

			<div className="grid gap-8 lg:grid-cols-3">
				<div className="lg:col-span-2">
					<div className="space-y-4">
						{imageUrls.length > 0 ? (
							<div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
								<Image
									src={imageUrls[0]}
									alt={listing.title}
									fill
									className="object-cover"
									priority
								/>
								{isBoosted && (
									<Badge className="absolute left-4 top-4 bg-yellow-500 hover:bg-yellow-600">
										<Zap className="mr-1 h-3 w-3" />
										Boosted
									</Badge>
								)}
							</div>
						) : (
							<div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted">
								<span className="text-muted-foreground">No images</span>
							</div>
						)}

						{imageUrls.length > 1 && (
							<div className="flex gap-2 overflow-x-auto pb-2">
								{imageUrls.map((url, index) => (
									<div
										key={index}
										className="relative h-20 w-28 flex-shrink-0 overflow-hidden rounded-md"
									>
										<Image
											src={url}
											alt={`${listing.title} ${index + 1}`}
											fill
											className="object-cover"
										/>
									</div>
								))}
							</div>
						)}
					</div>

					<div className="mt-8">
						<h1 className="text-3xl font-bold">{listing.title}</h1>
						<p className="mt-2 text-2xl font-bold text-primary">
							{listing.price.toLocaleString()} XAF
						</p>

						<div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
							<div className="flex items-center">
								<MapPin className="mr-1 h-4 w-4" />
								{listing.location}
							</div>
							<div className="flex items-center">
								<Calendar className="mr-1 h-4 w-4" />
								Posted {new Date(listing.createdAt).toLocaleDateString()}
							</div>
							{listing.views !== undefined && (
								<div className="flex items-center">
									<Eye className="mr-1 h-4 w-4" />
									{listing.views} views
								</div>
							)}
						</div>

						{category && (
							<Badge variant="secondary" className="mt-4">
								{category.name}
							</Badge>
						)}

						<Separator className="my-6" />

						<div>
							<h2 className="mb-3 text-lg font-semibold">Description</h2>
							<p className="whitespace-pre-wrap text-muted-foreground">
								{listing.description}
							</p>
						</div>

						{listing.attributes && typeof listing.attributes === "object" && (
							<>
								<Separator className="my-6" />
								<div>
									<h2 className="mb-3 text-lg font-semibold">Details</h2>
									<dl className="grid grid-cols-2 gap-4">
										{Object.entries(listing.attributes).map(([key, value]) => (
											<div key={key}>
												<dt className="text-sm font-medium text-muted-foreground">
													{key.charAt(0).toUpperCase() + key.slice(1)}
												</dt>
												<dd>{String(value)}</dd>
											</div>
										))}
									</dl>
								</div>
							</>
						)}
					</div>
				</div>

				<div className="lg:col-span-1">
					<div className="sticky top-24 space-y-6">
						{isBoosted && listing.boostedUntil && (
							<div className="rounded-lg bg-yellow-50 p-4 text-yellow-900 dark:bg-yellow-900/20">
								<div className="flex items-center">
									<Zap className="mr-2 h-5 w-5" />
									<span className="font-medium">Boosted until</span>
								</div>
								<p className="mt-1 text-sm">
									{new Date(listing.boostedUntil).toLocaleDateString()}
								</p>
							</div>
						)}

						<div className="rounded-lg border p-6">
							{seller ? (
								<Link href={`/profile/${seller.id}`}>
									<div className="flex items-center gap-4">
										<Avatar className="h-12 w-12">
											<AvatarImage
												src={
													(seller.avatar as { url?: string })?.url || undefined
												}
											/>
											<AvatarFallback>
												{seller.name?.charAt(0) || "?"}
											</AvatarFallback>
										</Avatar>
										<div>
											<p className="font-medium">{seller.name}</p>
											{seller.rating !== undefined &&
												seller.rating !== null && (
													<p className="text-sm text-muted-foreground">
														★ {seller.rating.toFixed(1)} ({seller.totalReviews}{" "}
														reviews)
													</p>
												)}
										</div>
									</div>
								</Link>
							) : (
								<p className="text-muted-foreground">Unknown seller</p>
							)}

							<div className="mt-6 flex flex-col gap-2">
								<Link
									href={`/messages?listing=${listing.id}`}
									className="w-full"
								>
									<Button className="w-full">
										<MessageCircle className="mr-2 h-4 w-4" />
										Message Seller
									</Button>
								</Link>
								<div className="flex gap-2">
									<Button variant="outline" className="flex-1">
										<Heart className="mr-2 h-4 w-4" />
										Save
									</Button>
									<ReportDialog
										targetType="listing"
										targetId={String(listing.id)}
										asChild
									>
										<Button variant="outline" size="icon">
											<Flag className="h-4 w-4" />
										</Button>
									</ReportDialog>
								</div>
							</div>
						</div>

						<p className="text-xs text-muted-foreground">
							Posted {new Date(listing.createdAt).toLocaleDateString()}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
