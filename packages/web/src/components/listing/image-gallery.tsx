"use client";

import {
	ChevronLeft,
	ChevronRight,
	X,
	Zap,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface ImageGalleryProps {
	images: string[];
	title: string;
	isBoosted?: boolean;
}

export function ImageGallery({ images, title, isBoosted }: ImageGalleryProps) {
	const t = useTranslations("Listing");
	const [currentIndex, setCurrentIndex] = useState(0);
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const [lightboxIdx, setLightboxIdx] = useState(0);
	const [zoomed, setZoomed] = useState(false);
	// Swiping the main photo on a phone, as every marketplace app does.
	const touchStartX = useRef<number | null>(null);
	const swiped = useRef(false);

	useEffect(() => {
		if (!lightboxOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setLightboxOpen(false);
				setZoomed(false);
			}
			if (e.key === "ArrowLeft")
				setLightboxIdx((i) => (i === 0 ? images.length - 1 : i - 1));
			if (e.key === "ArrowRight")
				setLightboxIdx((i) => (i === images.length - 1 ? 0 : i + 1));
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [lightboxOpen, images.length]);

	if (images.length === 0) {
		return (
			<div className="flex aspect-[4/3] items-center justify-center bg-subtle">
				<span className="text-ink-faint">{t("noImages")}</span>
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

	function openLightbox(idx: number) {
		setLightboxIdx(idx);
		setZoomed(false);
		setLightboxOpen(true);
	}

	return (
		<>
			<div>
				<div
					className="relative aspect-[4/3] touch-pan-y"
					onTouchStart={(e) => {
						touchStartX.current = e.touches[0]?.clientX ?? null;
						swiped.current = false;
					}}
					onTouchEnd={(e) => {
						const start = touchStartX.current;
						const end = e.changedTouches[0]?.clientX;
						touchStartX.current = null;
						if (start === null || end === undefined || images.length < 2)
							return;
						const dx = end - start;
						if (Math.abs(dx) < 40) return;
						swiped.current = true;
						if (dx < 0) next();
						else prev();
					}}
				>
					<button
						type="button"
						className="block h-full w-full cursor-zoom-in"
						onClick={() => {
							// The tap that ends a swipe is not a request to zoom.
							if (swiped.current) {
								swiped.current = false;
								return;
							}
							openLightbox(currentIndex);
						}}
						aria-label={t("viewFullSize")}
					>
						<Image
							src={images[currentIndex]}
							alt={`${title} ${currentIndex + 1}`}
							fill
							sizes="(min-width: 1024px) 760px, 100vw"
							className="object-cover"
							priority
						/>
					</button>
					{isBoosted && (
						<span className="pointer-events-none absolute top-3 left-3 flex items-center gap-1 rounded bg-[#F59E0B] px-2 py-1 font-bold text-white text-xs shadow">
							<Zap className="h-3 w-3" />
							{t("listingFeatured")}
						</span>
					)}
					{images.length > 1 && (
						<>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									prev();
								}}
								aria-label={t("previousPhoto")}
								className="-translate-y-1/2 absolute top-1/2 left-2 flex h-11 w-11 items-center justify-center rounded-full bg-surface/80 text-ink shadow backdrop-blur-sm transition-colors hover:bg-surface"
							>
								<ChevronLeft className="h-5 w-5" />
							</button>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									next();
								}}
								aria-label={t("nextPhoto")}
								className="-translate-y-1/2 absolute top-1/2 right-2 flex h-11 w-11 items-center justify-center rounded-full bg-surface/80 text-ink shadow backdrop-blur-sm transition-colors hover:bg-surface"
							>
								<ChevronRight className="h-5 w-5" />
							</button>
							<span className="pointer-events-none absolute right-3 bottom-3 rounded bg-black/60 px-2 py-1 text-white text-xs">
								{currentIndex + 1} / {images.length}
							</span>
						</>
					)}
				</div>
				{images.length > 1 && (
					<div className="grid grid-cols-6 gap-2 p-3">
						{images.map((url, i) => (
							<button
								type="button"
								key={i}
								onClick={() => goTo(i)}
								className={`relative h-12 overflow-hidden rounded-lg border-2 transition-colors sm:h-[72px] ${
									i === currentIndex
										? "border-brand"
										: "border-transparent hover:border-ink-faint"
								}`}
							>
								<Image
									src={url}
									alt={`${title} ${i + 1}`}
									fill
									sizes="(min-width: 1024px) 128px, 17vw"
									className="object-cover"
								/>
							</button>
						))}
					</div>
				)}
			</div>

			{/* Lightbox */}
			{lightboxOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
					{/* Backdrop close button */}
					<button
						type="button"
						aria-label={t("closeLightbox")}
						className="absolute inset-0 w-full cursor-default"
						onClick={() => {
							setLightboxOpen(false);
							setZoomed(false);
						}}
					/>

					{/* Controls */}
					<div className="absolute top-4 right-4 z-10 flex gap-2">
						<button
							type="button"
							onClick={() => setZoomed((z) => !z)}
							className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
							aria-label={zoomed ? t("zoomOut") : t("zoomIn")}
						>
							{zoomed ? (
								<ZoomOut className="h-5 w-5" />
							) : (
								<ZoomIn className="h-5 w-5" />
							)}
						</button>
						<button
							type="button"
							onClick={() => {
								setLightboxOpen(false);
								setZoomed(false);
							}}
							className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
							aria-label={t("closeLightbox")}
						>
							<X className="h-5 w-5" />
						</button>
					</div>

					{/* Image */}
					<div className="relative z-10 flex max-h-screen max-w-screen items-center justify-center overflow-auto p-4">
						<button
							type="button"
							onClick={() => setZoomed((z) => !z)}
							aria-label={zoomed ? t("zoomOut") : t("zoomIn")}
							className="rounded focus:outline-none"
						>
							<img
								src={images[lightboxIdx]}
								alt={`${title} ${lightboxIdx + 1}`}
								className="max-h-[90vh] rounded transition-transform duration-200"
								style={{
									maxWidth: zoomed ? "none" : "90vw",
									transform: zoomed ? "scale(2)" : "scale(1)",
									transformOrigin: "center",
									cursor: zoomed ? "zoom-out" : "zoom-in",
								}}
							/>
						</button>
					</div>

					{/* Navigation */}
					{images.length > 1 && (
						<>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									setLightboxIdx((i) => (i === 0 ? images.length - 1 : i - 1));
									setZoomed(false);
								}}
								className="-translate-y-1/2 absolute top-1/2 left-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
							>
								<ChevronLeft className="h-6 w-6" />
							</button>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									setLightboxIdx((i) => (i === images.length - 1 ? 0 : i + 1));
									setZoomed(false);
								}}
								className="-translate-y-1/2 absolute top-1/2 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
							>
								<ChevronRight className="h-6 w-6" />
							</button>
							<span className="-translate-x-1/2 absolute bottom-4 left-1/2 z-10 rounded bg-black/60 px-3 py-1 text-sm text-white">
								{lightboxIdx + 1} / {images.length}
							</span>
						</>
					)}
				</div>
			)}
		</>
	);
}
