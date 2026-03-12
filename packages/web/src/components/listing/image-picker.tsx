"use client";

import { Upload, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";

interface ImagePickerProps {
	previews: string[];
	onAdd: (files: File[]) => void;
	onRemove: (index: number) => void;
	max?: number;
}

export function ImagePicker({
	previews,
	onAdd,
	onRemove,
	max = 10,
}: ImagePickerProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
		const files = Array.from(e.target.files || []);
		if (previews.length + files.length > max) {
			alert(`Maximum ${max} images allowed`);
			return;
		}
		onAdd(files);
		// Reset so the same file can be selected again
		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	return (
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
	);
}
