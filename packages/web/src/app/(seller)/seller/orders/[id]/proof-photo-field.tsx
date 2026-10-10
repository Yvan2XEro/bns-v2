"use client";

import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import { useUploadShipmentPhoto } from "~/hooks/use-shop-shipments";
import { resolveErrorMessage } from "~/lib/apiError";

/** Uploads on pick and reports the proof row's id; the form holds the id, never the file. */
export function ProofPhotoField({
	shipmentId,
	kind,
	photoId,
	onChange,
	required = false,
}: {
	shipmentId: string;
	kind: "attempt" | "handover" | "declaration";
	photoId: string | null;
	onChange: (photoId: string | null) => void;
	required?: boolean;
}) {
	const t = useTranslations("SellerShipments");
	const tRoot = useTranslations();
	const upload = useUploadShipmentPhoto();
	return (
		<div className="space-y-1.5">
			<label
				htmlFor={`photo-${shipmentId}-${kind}`}
				className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#CBD5E1] px-4 font-medium text-sm"
			>
				<Camera aria-hidden className="h-4 w-4" />
				{required ? t("photoRequired") : t("photoOptional")}
				<input
					id={`photo-${shipmentId}-${kind}`}
					type="file"
					accept="image/jpeg,image/png"
					capture="environment"
					className="sr-only"
					disabled={upload.isPending}
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						if (!file) return;
						upload.mutate(
							{ shipmentId, file, kind },
							{ onSuccess: (proof) => onChange(proof.id) },
						);
					}}
				/>
			</label>
			{photoId && <p className="text-[#166534] text-xs">{t("photoAdded")}</p>}
			{upload.isError && (
				<p role="alert" className="text-red-700 text-xs">
					{resolveErrorMessage(upload.error, tRoot)}
				</p>
			)}
		</div>
	);
}
