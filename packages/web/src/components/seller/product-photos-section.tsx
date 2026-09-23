"use client";

import { useTranslations } from "next-intl";
import type { Control } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import { ImagePicker } from "~/components/listing/image-picker";
import { EditorSection } from "~/components/seller/editor-section";
import { ExistingImages } from "~/components/seller/existing-images";
import { MAX_IMAGES, type ProductFormState } from "~/lib/product-form";

export function ProductPhotosSection({
	control,
}: {
	control: Control<ProductFormState>;
}) {
	const t = useTranslations("ProductEditor");
	const existingImages = useWatch({ control, name: "existingImages" }) ?? [];
	const newImages = useWatch({ control, name: "newImages" }) ?? [];
	const room = MAX_IMAGES - existingImages.length;

	return (
		<EditorSection
			title={t("photos", { count: existingImages.length + newImages.length })}
		>
			<div className="space-y-3">
				<Controller
					control={control}
					name="existingImages"
					render={({ field }) => (
						<ExistingImages
							images={field.value}
							onRemove={(id) =>
								field.onChange(field.value.filter((image) => image.id !== id))
							}
						/>
					)}
				/>
				{room > 0 && (
					<Controller
						control={control}
						name="newImages"
						render={({ field }) => (
							<ImagePicker
								previews={field.value.map((draft) => draft.preview)}
								max={room}
								onAdd={(files) =>
									field.onChange([
										...field.value,
										...files.map((file) => ({
											file,
											preview: URL.createObjectURL(file),
										})),
									])
								}
								onRemove={(index) => {
									const dropped = field.value[index];
									if (dropped) URL.revokeObjectURL(dropped.preview);
									field.onChange(field.value.filter((_, i) => i !== index));
								}}
							/>
						)}
					/>
				)}
				<p className="text-[#94A3B8] text-xs">{t("photosHint")}</p>
			</div>
		</EditorSection>
	);
}
