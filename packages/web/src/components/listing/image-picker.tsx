"use client";

import { Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { ImageCropper } from "~/components/ui/image-cropper";
import { Label } from "~/components/ui/label";

interface ImagePickerProps {
	previews: string[];
	onAdd: (files: File[]) => void;
	onRemove: (index: number) => void;
	max?: number;
	cropAspect?: number;
}

export function ImagePicker({
	previews,
	onAdd,
	onRemove,
	max = 10,
	cropAspect = 4 / 3,
}: ImagePickerProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [cropQueue, setCropQueue] = useState<string[]>([]);
	const [croppedFiles, setCroppedFiles] = useState<File[]>([]);
	const [rawFiles, setRawFiles] = useState<File[]>([]);

	function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(e.target.files || []);
		if (previews.length + files.length > max) {
			alert(`Maximum ${max} images allowed`);
			if (fileInputRef.current) fileInputRef.current.value = "";
			return;
		}

		// Build data URLs for cropping queue
		const urls: string[] = [];
		let loaded = 0;
		setRawFiles(files);

		for (const file of files) {
			const reader = new FileReader();
			reader.onload = (ev) => {
				urls.push(ev.target?.result as string);
				loaded++;
				if (loaded === files.length) {
					setCropQueue(urls);
					setCroppedFiles([]);
				}
			};
			reader.readAsDataURL(file);
		}

		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	function handleCropDone(blob: Blob) {
		const index = croppedFiles.length;
		const name = rawFiles[index]?.name || `image-${index}.jpg`;
		const file = new File([blob], name, { type: "image/jpeg" });

		const newCropped = [...croppedFiles, file];
		setCroppedFiles(newCropped);

		if (newCropped.length >= cropQueue.length) {
			// All images cropped, add them all
			onAdd(newCropped);
			setCropQueue([]);
			setCroppedFiles([]);
			setRawFiles([]);
		}
	}

	function handleCropCancel() {
		// Skip current image, move to next
		const index = croppedFiles.length;

		if (index + 1 >= cropQueue.length) {
			// Last one, finish with what we have
			if (croppedFiles.length > 0) {
				onAdd(croppedFiles);
			}
			setCropQueue([]);
			setCroppedFiles([]);
			setRawFiles([]);
		} else {
			// Skip this one by adding a placeholder then removing it
			// Just move forward by not adding anything
			const remaining = cropQueue.slice(index + 1);
			setCropQueue(remaining);
			setCroppedFiles([]);
			const remainingRaw = rawFiles.slice(index + 1);
			setRawFiles(remainingRaw);

			if (croppedFiles.length > 0) {
				onAdd(croppedFiles);
			}
		}
	}

	const currentCropIndex = croppedFiles.length;
	const currentCropSrc = cropQueue[currentCropIndex] || null;

	return (
		<>
			{currentCropSrc && (
				<ImageCropper
					imageSrc={currentCropSrc}
					aspect={cropAspect}
					onCropDone={handleCropDone}
					onCancel={handleCropCancel}
				/>
			)}
			<div className="space-y-2">
				<Label>Images (max {max})</Label>
				<div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
					{previews.map((preview, index) => (
						<div key={index} className="relative aspect-square">
							<img
								src={preview}
								alt={`Preview ${index + 1}`}
								className="h-full w-full rounded-md object-cover"
							/>
							<Button
								type="button"
								variant="destructive"
								size="icon"
								className="-top-2 -right-2 absolute h-6 w-6"
								onClick={() => onRemove(index)}
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
					))}
					{previews.length < max && (
						<button
							type="button"
							className="flex aspect-square items-center justify-center rounded-md border-2 border-dashed transition-colors hover:border-primary/50"
							onClick={() => fileInputRef.current?.click()}
						>
							<Upload className="h-6 w-6 text-muted-foreground" />
						</button>
					)}
				</div>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					multiple
					className="hidden"
					onChange={handleSelect}
				/>
			</div>
		</>
	);
}
