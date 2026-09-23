"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ExistingImage } from "~/lib/product-form";

export function ExistingImages({
	images,
	onRemove,
}: {
	images: ExistingImage[];
	onRemove: (id: string) => void;
}) {
	const t = useTranslations("ProductEditor");
	if (images.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-2">
			{images.map((image, index) => (
				<div
					key={image.id}
					className="relative h-24 w-24 overflow-hidden rounded-lg bg-[#F1F5F9]"
				>
					{image.url && (
						// biome-ignore lint/performance/noImgElement: media from arbitrary storage hosts
						<img
							src={image.url}
							alt=""
							className="h-full w-full object-cover"
						/>
					)}
					{index === 0 && (
						<span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white">
							{t("cover")}
						</span>
					)}
					<button
						type="button"
						onClick={() => onRemove(image.id)}
						className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[#0F172A]"
						aria-label={t("removeImage")}
					>
						<X aria-hidden="true" className="h-3.5 w-3.5" />
					</button>
				</div>
			))}
		</div>
	);
}
