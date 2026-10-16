"use client";

import { useOrderMoney } from "~/hooks/use-order-money";
import type { Listing, Media } from "~/types";

/** One selectable row of the move-listings dialog: thumbnail, title and price. */
export function MoveListingRow({
	listing,
	checked,
	onToggle,
}: {
	listing: Listing;
	checked: boolean;
	onToggle: () => void;
}) {
	const formatOrderMoney = useOrderMoney();
	const image = listing.images?.[0]?.image as Media | string | undefined;
	const url =
		typeof image === "object" ? (image.thumbnailURL ?? image.url) : null;

	return (
		<li>
			<label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-2">
				<input
					type="checkbox"
					className="h-4 w-4 accent-brand"
					checked={checked}
					onChange={onToggle}
				/>
				<div className="h-11 w-11 shrink-0 overflow-hidden rounded bg-subtle">
					{url && (
						// biome-ignore lint/performance/noImgElement: thumbnails from arbitrary storage hosts
						<img src={url} alt="" className="h-full w-full object-cover" />
					)}
				</div>
				<div className="min-w-0">
					<p className="truncate font-medium text-ink text-sm">
						{listing.title}
					</p>
					<p className="text-ink-muted text-xs">
						{formatOrderMoney(listing.price)}
					</p>
				</div>
			</label>
		</li>
	);
}
