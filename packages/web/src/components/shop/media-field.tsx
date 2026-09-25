"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { useUploadMedia } from "~/hooks/use-upload-media";
import { resolveErrorMessage } from "~/lib/apiError";

/** Uploads on pick and reports the new media id; the parent saves it with the form. */
export function MediaField({
	label,
	hint,
	previewUrl,
	onUploaded,
	onRemove,
	shape,
}: {
	label: string;
	hint: string;
	previewUrl: string | null;
	onUploaded: (id: string, url: string) => void;
	onRemove: () => void;
	shape: "square" | "banner";
}) {
	const t = useTranslations("ShopManage");
	const tRoot = useTranslations();
	const input = useRef<HTMLInputElement>(null);
	const uploadMedia = useUploadMedia();

	async function pick(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (input.current) input.current.value = "";
		if (!file) return;
		try {
			const id = await uploadMedia.mutateAsync({ file, alt: label });
			onUploaded(id, URL.createObjectURL(file));
		} catch {
			// surfaced through uploadMedia.isError below
		}
	}

	return (
		<div className="flex items-center gap-4">
			<div
				className={
					shape === "square"
						? "h-20 w-20 overflow-hidden rounded-2xl bg-[#F1F5F9]"
						: "h-20 w-48 overflow-hidden rounded-lg bg-[#F1F5F9]"
				}
			>
				{previewUrl && (
					// biome-ignore lint/performance/noImgElement: preview of an upload or of stored media
					<img src={previewUrl} alt="" className="h-full w-full object-cover" />
				)}
			</div>
			<div className="space-y-1">
				<p className="font-semibold text-[#0F172A] text-sm">{label}</p>
				<p className="text-[#64748B] text-xs">{hint}</p>
				<div className="flex gap-3 text-sm">
					<button
						type="button"
						onClick={() => input.current?.click()}
						className="font-semibold text-[#1E40AF]"
						disabled={uploadMedia.isPending}
					>
						{uploadMedia.isPending ? (
							<LoaderCircle className="h-4 w-4 animate-spin" />
						) : (
							t("change")
						)}
					</button>
					{previewUrl && (
						<button type="button" onClick={onRemove} className="text-[#64748B]">
							{t("remove")}
						</button>
					)}
				</div>
				{uploadMedia.isError && (
					<p className="text-red-600 text-xs">
						{resolveErrorMessage(uploadMedia.error, tRoot, t("uploadFailed"))}
					</p>
				)}
			</div>
			<input
				ref={input}
				type="file"
				accept="image/png,image/jpeg,image/webp"
				className="hidden"
				onChange={pick}
			/>
		</div>
	);
}
