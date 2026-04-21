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
import { useEffect, useState } from "react";

interface ImageGalleryProps {
	images: string[];
	title: string;
	isBoosted?: boolean;
}

export function ImageGallery({ images, title, isBoosted }: ImageGalleryProps) {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const [lightboxIdx, setLightboxIdx] = useState(0);
	const [zoomed, setZoomed] = useState(false);

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

	function openLightbox(idx: number) {
		setLightboxIdx(idx);
		setZoomed(false);
		setLightboxOpen(true);
	}

	return (
		<>
			<div>
				<div className="relative aspect-[4/3]">
					<button
						type="button"
						className="block h-full w-full cursor-zoom-in"
						onClick={() => openLightbox(currentIndex)}
						aria-label="View full size"
					>
						<Image
							src={images[currentIndex]}
							alt={`${title} ${currentIndex + 1}`}
							fill
							className="object-cover"
							priority
						/>
					</button>
					{isBoosted && (
						<span className="pointer-events-none absolute top-3 left-3 flex items-center gap-1 rounded bg-[#F59E0B] px-2 py-1 font-bold text-white text-xs shadow">
							<Zap className="h-3 w-3" />
							Featured
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
								className="-translate-y-1/2 absolute top-1/2 left-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[#0F172A] shadow backdrop-blur-sm transition-colors hover:bg-white"
							>
								<ChevronLeft className="h-5 w-5" />
							</button>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									next();
								}}
								className="-translate-y-1/2 absolute top-1/2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[#0F172A] shadow backdrop-blur-sm transition-colors hover:bg-white"
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
					<div className="flex gap-1 overflow-x-auto border-[#E2E8F0] border-t p-2">
						{images.map((url, i) => (
							<button
								type="button"
								key={i}
								onClick={() => goTo(i)}
								className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
									i === currentIndex
										? "border-[#1E40AF]"
										: "border-[#E2E8F0] hover:border-[#94A3B8]"
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

			{/* Lightbox */}
			{lightboxOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
					{/* Backdrop close button */}
					<button
						type="button"
						aria-label="Close lightbox"
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
							aria-label={zoomed ? "Zoom out" : "Zoom in"}
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
							aria-label="Close"
						>
							<X className="h-5 w-5" />
						</button>
					</div>

					{/* Image */}
					<div className="relative z-10 flex max-h-screen max-w-screen items-center justify-center overflow-auto p-4">
						<button
							type="button"
							onClick={() => setZoomed((z) => !z)}
							aria-label={zoomed ? "Zoom out" : "Zoom in"}
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
