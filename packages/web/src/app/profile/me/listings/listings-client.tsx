"use client";

import {
	AlertTriangle,
	CheckCircle,
	Clock,
	Edit,
	ImageIcon,
	Loader2,
	MoreVertical,
	RefreshCw,
	Sparkles,
	Timer,
	Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BoostDialog } from "~/components/listing/boost-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { deleteListing, markListingAsSold, renewListing } from "~/lib/actions";
import type { Listing, Media } from "~/types";

function getListingImageUrl(listing: Listing): string | null {
	if (!listing.images || listing.images.length === 0) return null;
	const media = listing.images[0].image as Media | undefined;
	return media?.url || media?.thumbnailURL || null;
}

export function MyListingsClient({ listings }: { listings: Listing[] }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	async function handleMarkAsSold(id: string) {
		if (!confirm("Mark this listing as sold?")) return;

		startTransition(async () => {
			const result = await markListingAsSold(id);
			if (!result.success) {
				alert(result.error);
			}
			router.refresh();
		});
	}

	async function handleRenew(id: string) {
		if (!confirm("Renew this listing? It will be resubmitted for review."))
			return;

		startTransition(async () => {
			const result = await renewListing(id);
			if (!result.success) {
				alert(result.error);
			}
			router.refresh();
		});
	}

	async function handleDelete(id: string) {
		if (!confirm("Are you sure you want to delete this listing?")) return;

		startTransition(async () => {
			const result = await deleteListing(id);
			if (!result.success) {
				alert(result.error);
			}
			router.refresh();
		});
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{listings.map((listing) => {
				const isBoosted =
					listing.boostedUntil && new Date(listing.boostedUntil) > new Date();
				const imageUrl = getListingImageUrl(listing);
				const daysLeft = isBoosted
					? Math.ceil(
							(new Date(listing.boostedUntil as string).getTime() -
								Date.now()) /
								(1000 * 60 * 60 * 24),
						)
					: 0;
				const imageCount = listing.images?.length || 0;
				const expiresAt = listing.expiresAt
					? new Date(listing.expiresAt)
					: null;
				const daysUntilExpiry = expiresAt
					? Math.ceil(
							(expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
						)
					: null;
				const isListingActive =
					listing.status === "published" || listing.status === "pending";

				return (
					<div
						key={listing.id}
						className={`group hover:-translate-y-1 relative overflow-hidden rounded-xl border bg-white transition-all duration-300 hover:shadow-black/5 hover:shadow-lg ${
							isBoosted
								? "border-[#F59E0B]/40 ring-1 ring-[#F59E0B]/20"
								: "border-[#E2E8F0] hover:border-[#93C5FD]"
						}`}
					>
						{/* Image */}
						<Link
							href={`/listing/${listing.id}`}
							className="relative block aspect-[16/10] overflow-hidden bg-[#F1F5F9]"
						>
							{imageUrl ? (
								<Image
									src={imageUrl}
									alt={listing.title}
									fill
									className="object-cover transition-transform duration-300 group-hover:scale-105"
									sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
								/>
							) : (
								<div className="flex h-full w-full flex-col items-center justify-center gap-1">
									<ImageIcon className="h-8 w-8 text-[#CBD5E1]" />
									<span className="text-[#94A3B8] text-xs">No photo</span>
								</div>
							)}

							{/* Status overlay */}
							{listing.status === "sold" && (
								<div className="absolute inset-0 flex items-center justify-center bg-black/50">
									<span className="rounded-full bg-white px-3 py-1 font-bold text-[#0F172A] text-xs uppercase">
										Sold
									</span>
								</div>
							)}
							{listing.status === "expired" && (
								<div className="absolute inset-0 flex items-center justify-center bg-black/40">
									<span className="rounded-full bg-orange-500 px-3 py-1 font-bold text-white text-xs uppercase">
										Expired
									</span>
								</div>
							)}

							{/* Top badges */}
							<div className="absolute top-2 left-2 flex gap-1.5">
								<span
									className={`rounded-md px-2 py-0.5 font-bold text-[10px] uppercase shadow-sm ${
										listing.status === "published"
											? "bg-emerald-500 text-white"
											: listing.status === "sold"
												? "bg-[#64748B] text-white"
												: listing.status === "pending"
													? "bg-blue-100 text-blue-800"
													: listing.status === "rejected"
														? "bg-red-100 text-red-800"
														: listing.status === "expired"
															? "bg-orange-100 text-orange-800"
															: "bg-amber-100 text-amber-800"
									}`}
								>
									{listing.status === "pending"
										? "pending review"
										: listing.status}
								</span>
								{isBoosted && (
									<span className="flex items-center gap-0.5 rounded-md bg-[#F59E0B] px-2 py-0.5 font-bold text-[10px] text-white shadow-sm">
										<Sparkles className="h-2.5 w-2.5" />
										{daysLeft}d
									</span>
								)}
							</div>

							{/* Image count */}
							{imageCount > 1 && (
								<div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 font-medium text-[10px] text-white">
									<ImageIcon className="h-3 w-3" />
									{imageCount}
								</div>
							)}
						</Link>

						{/* Content */}
						<div className="p-3.5">
							<Link href={`/listing/${listing.id}`}>
								<p className="font-bold text-[#0F172A] text-lg">
									{listing.price.toLocaleString()}{" "}
									<span className="font-medium text-[#64748B] text-xs">
										XAF
									</span>
								</p>
								<h3 className="mt-0.5 truncate text-[#334155] text-sm">
									{listing.title}
								</h3>
								<p className="mt-1 flex items-center gap-1 text-[#94A3B8] text-xs">
									<Clock className="h-3 w-3" />
									{new Date(listing.createdAt).toLocaleDateString()}
									<span className="mx-1">&middot;</span>
									{listing.location}
								</p>
							</Link>

							{/* Rejection reason */}
							{listing.status === "rejected" && (
								<div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2.5">
									<p className="flex items-center gap-1 font-semibold text-red-700 text-xs">
										<AlertTriangle className="h-3 w-3" />
										Rejected
									</p>
									<p className="mt-1 text-red-600 text-xs">
										{listing.rejectionReason || "No reason provided"}
									</p>
									<Link
										href={`/listing/${listing.id}/edit`}
										className="mt-2 inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 font-medium text-white text-xs transition-colors hover:bg-red-700"
									>
										<Edit className="h-3 w-3" />
										Edit & Resubmit
									</Link>
								</div>
							)}

							{/* Expiry info */}
							{listing.status === "expired" && (
								<p className="mt-1.5 flex items-center gap-1 font-medium text-red-500 text-xs">
									<AlertTriangle className="h-3 w-3" />
									Expired
								</p>
							)}
							{isListingActive && expiresAt && daysUntilExpiry !== null && (
								<p
									className={`mt-1.5 flex items-center gap-1 font-medium text-xs ${
										daysUntilExpiry <= 5 ? "text-amber-600" : "text-[#94A3B8]"
									}`}
								>
									<Timer className="h-3 w-3" />
									{daysUntilExpiry <= 0
										? "Expires today"
										: daysUntilExpiry === 1
											? "Expires tomorrow"
											: `Expires in ${daysUntilExpiry} days`}
								</p>
							)}

							{/* Actions */}
							<div className="mt-3 flex items-center gap-2 border-[#F1F5F9] border-t pt-3">
								<Link href={`/listing/${listing.id}/edit`} className="flex-1">
									<button
										type="button"
										className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white font-medium text-[#475569] text-xs transition-all hover:border-[#93C5FD] hover:text-[#1E40AF] active:scale-[0.97]"
									>
										<Edit className="h-3.5 w-3.5" />
										Edit
									</button>
								</Link>
								{!isBoosted && listing.status === "published" && (
									<BoostDialog listingId={listing.id}>
										<button
											type="button"
											className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] font-bold text-[#0F172A] text-xs shadow-sm transition-all hover:shadow-amber-500/15 hover:shadow-md active:scale-[0.97]"
										>
											<Sparkles className="h-3.5 w-3.5" />
											Boost
										</button>
									</BoostDialog>
								)}
								{isBoosted && (
									<span className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-[#F59E0B]/30 bg-amber-50 font-semibold text-[#92400E] text-xs">
										<Sparkles className="h-3 w-3 text-[#F59E0B]" />
										Boosted
									</span>
								)}
								{listing.status === "expired" && (
									<button
										type="button"
										className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 font-bold text-white text-xs shadow-sm transition-all hover:shadow-blue-500/15 hover:shadow-md active:scale-[0.97]"
										onClick={() => handleRenew(listing.id)}
										disabled={isPending}
									>
										<RefreshCw className="h-3.5 w-3.5" />
										Renew
									</button>
								)}
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<button
											type="button"
											className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#94A3B8] transition-all hover:border-[#93C5FD] hover:text-[#475569] active:scale-90"
											disabled={isPending}
										>
											{isPending ? (
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
											) : (
												<MoreVertical className="h-3.5 w-3.5" />
											)}
										</button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-44">
										{listing.status === "published" && (
											<DropdownMenuItem
												onClick={() => handleMarkAsSold(listing.id)}
												className="text-sm"
											>
												<CheckCircle className="mr-2 h-4 w-4 text-emerald-500" />
												Mark as sold
											</DropdownMenuItem>
										)}
										{listing.status === "expired" && (
											<DropdownMenuItem
												onClick={() => handleRenew(listing.id)}
												className="text-sm"
											>
												<RefreshCw className="mr-2 h-4 w-4 text-blue-500" />
												Renew listing
											</DropdownMenuItem>
										)}
										<DropdownMenuItem
											className="text-red-600 text-sm focus:text-red-600"
											onClick={() => handleDelete(listing.id)}
										>
											<Trash2 className="mr-2 h-4 w-4" />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
