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
	placeholder,
}: {
	label: string;
	hint: string;
	previewUrl: string | null;
	onUploaded: (id: string, url: string) => void;
	onRemove: () => void;
	shape: "square" | "banner";
	/** Shown while there is no image, e.g. the shop's initials for a logo. */
	placeholder?: React.ReactNode;
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
						? "h-20 w-20 overflow-hidden rounded-2xl bg-subtle"
						: "h-20 w-48 overflow-hidden rounded-lg bg-subtle"
				}
			>
				{previewUrl ? (
					// biome-ignore lint/performance/noImgElement: preview of an upload or of stored media
					<img src={previewUrl} alt="" className="h-full w-full object-cover" />
				) : (
					placeholder
				)}
			</div>
			<div className="space-y-1">
				<p className="font-semibold text-ink text-sm">{label}</p>
				<p className="text-ink-muted text-xs">{hint}</p>
				<div className="flex gap-3 text-sm">
					<button
						type="button"
						onClick={() => input.current?.click()}
						className="font-semibold text-brand"
						disabled={uploadMedia.isPending}
					>
						{uploadMedia.isPending ? (
							<LoaderCircle className="h-4 w-4 animate-spin" />
						) : (
							t("change")
						)}
					</button>
					{previewUrl && (
						<button type="button" onClick={onRemove} className="text-ink-muted">
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
