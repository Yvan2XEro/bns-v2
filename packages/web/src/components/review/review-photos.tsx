"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
} from "~/components/ui/dialog";

export interface ReviewPhoto {
	id: string;
	url: string;
}

/** Thumbnails under a review; each opens the review's photos in a viewer. */
export function ReviewPhotos({ photos }: { photos: ReviewPhoto[] }) {
	const t = useTranslations("ReviewPhotos");
	const [open, setOpen] = useState<number | null>(null);
	const count = photos.length;
	if (count === 0) return null;
	const current = open === null ? null : photos[open];
	const step = (delta: number) =>
		setOpen((index) =>
			index === null ? null : (index + delta + count) % count,
		);

	return (
		<>
			<ul aria-label={t("label")} className="mt-3 flex flex-wrap gap-2">
				{photos.map((photo, index) => (
					<li key={photo.id}>
						<button
							type="button"
							onClick={() => setOpen(index)}
							aria-label={t("open", { index: index + 1, count })}
							className="block h-16 w-16 overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] focus-visible:outline-2 focus-visible:outline-[var(--shop-accent,#1E40AF)] focus-visible:outline-offset-2"
						>
							<img
								src={photo.url}
								alt=""
								loading="lazy"
								className="h-full w-full object-cover"
							/>
						</button>
					</li>
				))}
			</ul>
			<Dialog
				open={current !== null}
				onOpenChange={(next) => !next && setOpen(null)}
			>
				<DialogContent
					aria-describedby={undefined}
					className="max-w-3xl border-0 bg-black p-2 sm:p-4 [&>button:last-child]:hidden"
					onKeyDown={(event) => {
						if (event.key === "ArrowLeft") step(-1);
						if (event.key === "ArrowRight") step(1);
					}}
				>
					<DialogTitle className="sr-only">
						{t("viewerTitle", { index: (open ?? 0) + 1, count })}
					</DialogTitle>
					{current && (
						<img
							src={current.url}
							alt={t("viewerTitle", { index: (open ?? 0) + 1, count })}
							className="mx-auto max-h-[80vh] w-auto rounded object-contain"
						/>
					)}
					<DialogClose
						aria-label={t("close")}
						className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
					>
						<X className="h-5 w-5" />
					</DialogClose>
					{count > 1 && (
						<>
							<button
								type="button"
								onClick={() => step(-1)}
								aria-label={t("previous")}
								className="-translate-y-1/2 absolute top-1/2 left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
							>
								<ChevronLeft className="h-6 w-6" />
							</button>
							<button
								type="button"
								onClick={() => step(1)}
								aria-label={t("next")}
								className="-translate-y-1/2 absolute top-1/2 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
							>
								<ChevronRight className="h-6 w-6" />
							</button>
							<p className="-translate-x-1/2 absolute bottom-3 left-1/2 rounded bg-black/60 px-3 py-1 text-sm text-white">
								{(open ?? 0) + 1} / {count}
							</p>
						</>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
