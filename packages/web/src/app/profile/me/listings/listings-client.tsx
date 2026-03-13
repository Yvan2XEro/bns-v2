"use client";

import {
	CheckCircle,
	Clock,
	Edit,
	ImageIcon,
	Loader2,
	MoreVertical,
	Sparkles,
	Trash2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

	async function handleMarkAsSold(id: string) {
		if (!confirm("Mark this listing as sold?")) return;

		startTransition(async () => {
			try {
				const res = await fetch(`/api/listings/${id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ status: "sold" }),
					credentials: "include",
				});
				if (!res.ok) throw new Error();
				router.refresh();
			} catch {
				alert("Failed to update listing status");
			}
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

	async function handleBoost() {
		if (!selectedListing) return;
		setIsBoosting(true);

		try {
			const res = await fetch("/api/public/boost", {
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
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{listings.map((listing) => {
					const isBoosted =
						listing.boostedUntil && new Date(listing.boostedUntil) > new Date();
					const imageUrl = getListingImageUrl(listing);
					const daysLeft = isBoosted
						? Math.ceil(
								(new Date(listing.boostedUntil!).getTime() - Date.now()) /
									(1000 * 60 * 60 * 24),
							)
						: 0;
					const imageCount = listing.images?.length || 0;

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
										<span className="mx-1">·</span>
										{listing.location}
									</p>
								</Link>

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
										<button
											type="button"
											className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] font-bold text-[#0F172A] text-xs shadow-sm transition-all hover:shadow-amber-500/15 hover:shadow-md active:scale-[0.97]"
											onClick={() => {
												setSelectedListing(listing);
												setShowBoostDialog(true);
											}}
										>
											<Sparkles className="h-3.5 w-3.5" />
											Boost
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

			<Dialog open={showBoostDialog} onOpenChange={setShowBoostDialog}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F59E0B] to-[#FBBF24] shadow-amber-500/20 shadow-lg">
							<Sparkles className="h-6 w-6 text-white" />
						</div>
						<DialogTitle className="text-center text-xl">
							Boost your listing
						</DialogTitle>
						<DialogDescription className="text-center">
							Get more views by appearing at the top of search results.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2.5 py-3">
						{(["7", "14", "30"] as BoostDuration[]).map((duration) => {
							const selected = boostDuration === duration;
							const label =
								duration === "7"
									? "1 week"
									: duration === "14"
										? "2 weeks"
										: "1 month";
							const popular = duration === "14";
							return (
								<label
									key={duration}
									className={`relative flex cursor-pointer items-center justify-between rounded-xl border-2 p-4 transition-all duration-200 ${
										selected
											? "border-[#F59E0B] bg-amber-50/50 shadow-sm"
											: "border-[#E2E8F0] hover:border-[#F59E0B]/40 hover:bg-[#FFFBEB]/30"
									}`}
								>
									{popular && (
										<span className="-top-2.5 absolute right-3 rounded-full bg-[#F59E0B] px-2 py-0.5 font-bold text-[10px] text-white">
											Popular
										</span>
									)}
									<div className="flex items-center gap-3">
										<div
											className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
												selected
													? "border-[#F59E0B] bg-[#F59E0B]"
													: "border-[#CBD5E1]"
											}`}
										>
											{selected && (
												<div className="h-2 w-2 rounded-full bg-white" />
											)}
										</div>
										<input
											type="radio"
											name="duration"
											value={duration}
											checked={selected}
											onChange={() => setBoostDuration(duration)}
											className="sr-only"
										/>
										<div>
											<p className="font-semibold text-[#0F172A] text-sm">
												{label}
											</p>
											<p className="text-[#64748B] text-xs">
												{duration} days of visibility
											</p>
										</div>
									</div>
									<p className="font-bold text-[#0F172A] text-base">
										{boostPrices[duration]}{" "}
										<span className="font-medium text-[#64748B] text-xs">
											XAF
										</span>
									</p>
								</label>
							);
						})}
					</div>
					<DialogFooter className="flex-col gap-2 sm:flex-col">
						<Button
							className="w-full rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] font-bold text-[#0F172A] shadow-amber-500/20 shadow-md hover:shadow-lg"
							onClick={handleBoost}
							disabled={isBoosting}
						>
							{isBoosting ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Sparkles className="mr-2 h-4 w-4" />
							)}
							Pay {boostPrices[boostDuration]} XAF
						</Button>
						<button
							type="button"
							className="font-medium text-[#64748B] text-sm transition-colors hover:text-[#0F172A]"
							onClick={() => setShowBoostDialog(false)}
						>
							Cancel
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
