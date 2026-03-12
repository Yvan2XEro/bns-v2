"use client";

import { Check, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
// @ts-expect-error missing types
import Cropper, { type Area } from "react-easy-crop";

interface ImageCropperProps {
	imageSrc: string;
	aspect?: number;
	onCropDone: (croppedBlob: Blob) => void;
	onCancel: () => void;
}

export function ImageCropper({
	imageSrc,
	aspect = 1,
	onCropDone,
	onCancel,
}: ImageCropperProps) {
	const [crop, setCrop] = useState({ x: 0, y: 0 });
	const [zoom, setZoom] = useState(1);
	const [rotation, setRotation] = useState(0);
	const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

	const onCropComplete = useCallback((_: Area, pixels: Area) => {
		setCroppedAreaPixels(pixels);
	}, []);

	async function handleConfirm() {
		if (!croppedAreaPixels) return;
		const blob = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
		if (blob) onCropDone(blob);
	}

	return createPortal(
		<div className="fixed inset-0 z-[9999] bg-black">
			{/* Cropper takes the full screen */}
			<Cropper
				image={imageSrc}
				crop={crop}
				zoom={zoom}
				rotation={rotation}
				aspect={aspect}
				onCropChange={setCrop}
				onZoomChange={setZoom}
				onRotationChange={setRotation}
				onCropComplete={onCropComplete}
				cropShape={aspect === 1 ? "round" : "rect"}
				showGrid
				style={{
					containerStyle: {
						width: "100vw",
						height: "100vh",
					},
					cropAreaStyle: {
						border: "2px solid rgba(255,255,255,0.6)",
						borderRadius: aspect === 1 ? "50%" : "12px",
					},
				}}
			/>

			{/* Floating header */}
			<div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3">
				<button
					type="button"
					onClick={onCancel}
					className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-black/50 px-3 py-1.5 font-medium text-sm text-white backdrop-blur-sm transition-colors hover:bg-black/70"
				>
					<X className="h-4 w-4" />
					Cancel
				</button>
				<button
					type="button"
					onClick={handleConfirm}
					className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-[#1E40AF] px-4 py-1.5 font-bold text-sm text-white transition-all hover:bg-[#2563EB] active:scale-95"
				>
					<Check className="h-4 w-4" />
					Apply
				</button>
			</div>

			{/* Floating controls */}
			<div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-4 px-4 py-4">
				<div className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/50 px-4 py-2 backdrop-blur-sm">
					<button
						type="button"
						onClick={() => setZoom((z) => Math.max(1, z - 0.1))}
						className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-all hover:bg-white/20 active:scale-90"
					>
						<Minus className="h-4 w-4" />
					</button>
					<input
						type="range"
						min={1}
						max={3}
						step={0.01}
						value={zoom}
						onChange={(e) => setZoom(Number(e.target.value))}
						className="h-1 w-28 cursor-pointer appearance-none rounded-full bg-white/20 accent-[#3B82F6] sm:w-40"
					/>
					<button
						type="button"
						onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
						className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-all hover:bg-white/20 active:scale-90"
					>
						<Plus className="h-4 w-4" />
					</button>
					<div className="h-5 w-px bg-white/30" />
					<button
						type="button"
						onClick={() => setRotation((r) => (r + 90) % 360)}
						className="flex h-8 w-8 items-center justify-center rounded-full text-white transition-all hover:bg-white/20 active:scale-90"
					>
						<RotateCcw className="h-4 w-4" />
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
}

// Utility: crop the image and return a Blob
function createImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.addEventListener("load", () => resolve(image));
		image.addEventListener("error", (error) => reject(error));
		image.setAttribute("crossOrigin", "anonymous");
		image.src = url;
	});
}

function getRadianAngle(degreeValue: number) {
	return (degreeValue * Math.PI) / 180;
}

async function getCroppedImg(
	imageSrc: string,
	pixelCrop: Area,
	rotation = 0,
): Promise<Blob | null> {
	const image = await createImage(imageSrc);
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;

	const rotRad = getRadianAngle(rotation);

	const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
		image.width,
		image.height,
		rotation,
	);

	canvas.width = bBoxWidth;
	canvas.height = bBoxHeight;

	ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
	ctx.rotate(rotRad);
	ctx.translate(-image.width / 2, -image.height / 2);
	ctx.drawImage(image, 0, 0);

	const croppedCanvas = document.createElement("canvas");
	const croppedCtx = croppedCanvas.getContext("2d");
	if (!croppedCtx) return null;

	croppedCanvas.width = pixelCrop.width;
	croppedCanvas.height = pixelCrop.height;

	croppedCtx.drawImage(
		canvas,
		pixelCrop.x,
		pixelCrop.y,
		pixelCrop.width,
		pixelCrop.height,
		0,
		0,
		pixelCrop.width,
		pixelCrop.height,
	);

	return new Promise((resolve) => {
		croppedCanvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
	});
}

function rotateSize(width: number, height: number, rotation: number) {
	const rotRad = getRadianAngle(rotation);
	return {
		width:
			Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
		height:
			Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
	};
}
