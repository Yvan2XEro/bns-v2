"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { useAuth } from "~/hooks/use-auth";
import {
	useAttachListings,
	usePersonalListings,
} from "~/hooks/use-listings-move";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatXaf } from "~/lib/money";
import type { Media } from "~/types";

export function MoveListingsDialog({
	shopId,
	shopName,
	open,
	onOpenChange,
}: {
	shopId: string;
	shopName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useTranslations("ShopManage");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("moveTitle")}</DialogTitle>
					<DialogDescription>
						{t("moveBody", { shop: shopName })}
					</DialogDescription>
				</DialogHeader>
				{/* Mounted only while open, so each opening starts with fresh state. */}
				{open && (
					<MoveListingsBody
						shopId={shopId}
						onClose={() => onOpenChange(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function MoveListingsBody({
	shopId,
	onClose,
}: {
	shopId: string;
	onClose: () => void;
}) {
	const t = useTranslations("ShopManage");
	const tRoot = useTranslations();
	const router = useRouter();
	const { user } = useAuth();
	const listingsQuery = usePersonalListings(user?.id, true);
	const attachListings = useAttachListings(shopId);
	const [selected, setSelected] = useState<string[]>([]);

	// Pre-selects every listing once the list arrives; a later background
	// refetch must not wipe the seller's own selection.
	const initialized = useRef(false);
	useEffect(() => {
		if (initialized.current || !listingsQuery.data) return;
		initialized.current = true;
		setSelected(listingsQuery.data.docs.map((listing) => listing.id));
	}, [listingsQuery.data]);

	const listings = listingsQuery.data?.docs ?? null;
	const all =
		listings !== null &&
		listings.length > 0 &&
		selected.length === listings.length;
	const outcome = attachListings.data;

	async function submit() {
		if (selected.length === 0) return;
		try {
			await attachListings.mutateAsync(
				all ? { all: true } : { listingIds: selected },
			);
			router.refresh();
		} catch {
			// surfaced through attachListings.isError below
		}
	}

	return (
		<>
			{outcome ? (
				<p className="rounded-lg bg-[#F0FDF4] px-3 py-2 text-[#166534] text-sm">
					{t("moveDone", {
						moved: outcome.attached.length,
						skipped: outcome.skipped.length,
					})}
				</p>
			) : listingsQuery.isPending ? (
				<LoaderCircle className="mx-auto h-6 w-6 animate-spin text-[#94A3B8]" />
			) : listings === null || listings.length === 0 ? (
				<p className="text-[#64748B] text-sm">{t("moveNone")}</p>
			) : (
				<div className="space-y-3">
					<label className="flex items-center justify-between text-sm">
						<span className="flex items-center gap-2">
							<input
								type="checkbox"
								className="h-4 w-4 accent-[#1E40AF]"
								checked={all}
								onChange={(event) =>
									setSelected(
										event.target.checked
											? listings.map((listing) => listing.id)
											: [],
									)
								}
							/>
							{t("selectAll")}
						</span>
						<span className="text-[#64748B]">
							{selected.length} / {listings.length}
						</span>
					</label>
					<ul className="max-h-72 space-y-2 overflow-y-auto">
						{listings.map((listing) => {
							const image = listing.images?.[0]?.image as
								| Media
								| string
								| undefined;
							const url =
								typeof image === "object"
									? (image.thumbnailURL ?? image.url)
									: null;
							const checked = selected.includes(listing.id);
							return (
								<li key={listing.id}>
									<label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#E2E8F0] p-2">
										<input
											type="checkbox"
											className="h-4 w-4 accent-[#1E40AF]"
											checked={checked}
											onChange={() =>
												setSelected((prev) =>
													checked
														? prev.filter((id) => id !== listing.id)
														: [...prev, listing.id],
												)
											}
										/>
										<div className="h-11 w-11 shrink-0 overflow-hidden rounded bg-[#F1F5F9]">
											{url && (
												// biome-ignore lint/performance/noImgElement: thumbnails from arbitrary storage hosts
												<img
													src={url}
													alt=""
													className="h-full w-full object-cover"
												/>
											)}
										</div>
										<div className="min-w-0">
											<p className="truncate font-medium text-[#0F172A] text-sm">
												{listing.title}
											</p>
											<p className="text-[#64748B] text-xs">
												{formatXaf(listing.price)}
											</p>
										</div>
									</label>
								</li>
							);
						})}
					</ul>
					<ul className="space-y-1 text-[#334155] text-xs">
						{(["moveKeep", "moveSameLink", "moveStock"] as const).map((key) => (
							<li key={key} className="flex items-center gap-2">
								<Check className="h-3.5 w-3.5 text-[#16A34A]" />
								{t(key)}
							</li>
						))}
					</ul>
				</div>
			)}
			{attachListings.isError && (
				<p className="text-red-700 text-sm">
					{resolveErrorMessage(attachListings.error, tRoot)}
				</p>
			)}
			<DialogFooter>
				{outcome ? (
					<Button onClick={onClose}>{t("close")}</Button>
				) : (
					<Button
						onClick={submit}
						disabled={attachListings.isPending || selected.length === 0}
						className="bg-[#1E40AF] hover:bg-[#1E3A8A]"
					>
						{attachListings.isPending && (
							<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
						)}
						{t("moveSubmit", { count: selected.length })}
					</Button>
				)}
			</DialogFooter>
		</>
	);
}
