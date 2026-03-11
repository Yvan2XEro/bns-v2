"use client";

import { Edit, ImageIcon, Loader2, MoreVertical, Sparkles, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { deleteListing } from "~/lib/actions";
import type { BoostDuration, Listing, Media } from "~/types";

const boostPrices: Record<BoostDuration, number> = {
	"7": 500,
	"14": 900,
	"30": 1500,
};

function getListingImageUrl(listing: Listing): string | null {
	if (!listing.images || listing.images.length === 0) return null;
	const media = listing.images[0].image as Media | undefined;
	return media?.url || media?.thumbnailURL || null;
}

export function MyListingsClient({ listings }: { listings: Listing[] }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [showBoostDialog, setShowBoostDialog] = useState(false);
	const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
	const [boostDuration, setBoostDuration] = useState<BoostDuration>("7");
	const [isBoosting, setIsBoosting] = useState(false);

	async function handleDelete(id: number) {
		if (!confirm("Are you sure you want to delete this listing?")) return;

		startTransition(async () => {
			const result = await deleteListing(id);
			if (!result.success) {
				alert(result.error);
			}
			router.refresh();
		});
	}

	async function handleBoost() {
		if (!selectedListing) return;
		setIsBoosting(true);

		try {
			const res = await fetch("/api/boost", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					listingId: selectedListing.id,
					duration: boostDuration,
				}),
				credentials: "include",
			});

			if (res.ok) {
				const data = await res.json();
				if (data.paymentUrl) {
					window.location.href = data.paymentUrl;
				} else {
					alert("Boost initiated successfully!");
					router.refresh();
				}
			} else {
				throw new Error("Failed to create boost");
			}
		} catch {
			alert("Failed to boost listing. Please try again.");
		} finally {
			setIsBoosting(false);
			setShowBoostDialog(false);
		}
	}

	return (
		<>
			<div className="space-y-3">
				{listings.map((listing) => {
					const isBoosted =
						listing.boostedUntil &&
						new Date(listing.boostedUntil) > new Date();
					const imageUrl = getListingImageUrl(listing);

					return (
						<div
							key={listing.id}
							className="flex items-center gap-4 rounded-lg border p-3"
						>
							{/* Thumbnail */}
							<Link
								href={`/listing/${listing.id}`}
								className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-md bg-muted"
							>
								{imageUrl ? (
									<Image
										src={imageUrl}
										alt={listing.title}
										fill
										className="object-cover"
										sizes="80px"
									/>
								) : (
									<div className="flex h-full w-full items-center justify-center">
										<ImageIcon className="h-6 w-6 text-muted-foreground" />
									</div>
								)}
							</Link>

							{/* Info */}
							<Link href={`/listing/${listing.id}`} className="min-w-0 flex-1">
								<h3 className="truncate font-medium">{listing.title}</h3>
								<p className="text-sm text-muted-foreground">
									{listing.price.toLocaleString()} XAF • {listing.location}
								</p>
								<div className="mt-1 flex items-center gap-2">
									<Badge
										variant={
											listing.status === "published" ? "default" : "secondary"
										}
									>
										{listing.status}
									</Badge>
									{isBoosted && (
										<Badge variant="secondary">
											<Sparkles className="mr-1 h-3 w-3" />
											Boosted
										</Badge>
									)}
								</div>
							</Link>

							{/* Actions */}
							<div className="flex flex-shrink-0 items-center gap-2">
								<Link href={`/listing/${listing.id}/edit`}>
									<Button variant="outline" size="sm">
										<Edit className="mr-2 h-4 w-4" />
										Edit
									</Button>
								</Link>
								{!isBoosted && (
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											setSelectedListing(listing);
											setShowBoostDialog(true);
										}}
									>
										<Sparkles className="mr-2 h-4 w-4" />
										Boost
									</Button>
								)}
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											disabled={isPending}
										>
											{isPending ? (
												<Loader2 className="h-4 w-4 animate-spin" />
											) : (
												<MoreVertical className="h-4 w-4" />
											)}
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem
											className="text-destructive"
											onClick={() => handleDelete(listing.id)}
										>
											<Trash2 className="mr-2 h-4 w-4" />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>
					);
				})}
			</div>

			<Dialog open={showBoostDialog} onOpenChange={setShowBoostDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Boost Your Listing</DialogTitle>
						<DialogDescription>
							Increase visibility by boosting your listing to the top of search
							results.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						{(["7", "14", "30"] as BoostDuration[]).map((duration) => (
							<label
								key={duration}
								className={`flex cursor-pointer items-center justify-between rounded-lg border p-4 transition-colors ${
									boostDuration === duration
										? "border-primary bg-primary/5"
										: "hover:bg-accent"
								}`}
							>
								<div className="flex items-center gap-3">
									<input
										type="radio"
										name="duration"
										value={duration}
										checked={boostDuration === duration}
										onChange={() => setBoostDuration(duration)}
										className="h-4 w-4"
									/>
									<div>
										<p className="font-medium">{duration} days</p>
										<p className="text-sm text-muted-foreground">
											{duration === "7"
												? "One week"
												: duration === "14"
													? "Two weeks"
													: "One month"}{" "}
											of boosted visibility
										</p>
									</div>
								</div>
								<p className="font-bold">{boostPrices[duration]} XAF</p>
							</label>
						))}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowBoostDialog(false)}
						>
							Cancel
						</Button>
						<Button onClick={handleBoost} disabled={isBoosting}>
							{isBoosting ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Sparkles className="mr-2 h-4 w-4" />
							)}
							Pay {boostPrices[boostDuration]} XAF
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
