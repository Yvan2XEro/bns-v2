"use client";

import { ChevronLeft, ChevronRight, Zap } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

interface ImageGalleryProps {
	images: string[];
	title: string;
	isBoosted?: boolean;
}

export function ImageGallery({ images, title, isBoosted }: ImageGalleryProps) {
	const [currentIndex, setCurrentIndex] = useState(0);

	if (images.length === 0) {
		return (
			<div className="flex aspect-[4/3] items-center justify-center bg-[#F1F5F9]">
				<span className="text-[#94A3B8]">No images</span>
			</div>
		);
	}

	function goTo(index: number) {
		setCurrentIndex(index);
	}

	function prev() {
		setCurrentIndex((i) => (i === 0 ? images.length - 1 : i - 1));
	}

	function next() {
		setCurrentIndex((i) => (i === images.length - 1 ? 0 : i + 1));
	}

	return (
		<div>
			<div className="relative aspect-[4/3]">
				<Image
					src={images[currentIndex]}
					alt={`${title} ${currentIndex + 1}`}
					fill
					className="object-cover"
					priority
				/>
				{isBoosted && (
					<span className="absolute left-3 top-3 flex items-center gap-1 rounded bg-[#F59E0B] px-2 py-1 text-xs font-bold text-white shadow">
						<Zap className="h-3 w-3" />
						Featured
					</span>
				)}
				{images.length > 1 && (
					<>
						<button
							onClick={prev}
							className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-[#0F172A] shadow backdrop-blur-sm transition-colors hover:bg-white"
						>
							<ChevronLeft className="h-5 w-5" />
						</button>
						<button
							onClick={next}
							className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-[#0F172A] shadow backdrop-blur-sm transition-colors hover:bg-white"
						>
							<ChevronRight className="h-5 w-5" />
						</button>
						<span className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
							{currentIndex + 1} / {images.length}
						</span>
					</>
				)}
			</div>
			{/* Thumbnails */}
			{images.length > 1 && (
				<div className="flex gap-1 overflow-x-auto border-t border-[#E2E8F0] p-2">
					{images.map((url, i) => (
						<button
							key={i}
							onClick={() => goTo(i)}
							className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
								i === currentIndex ? "border-[#1E40AF]" : "border-[#E2E8F0] hover:border-[#94A3B8]"
							}`}
						>
							<Image
								src={url}
								alt={`${title} ${i + 1}`}
								fill
								className="object-cover"
							/>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
