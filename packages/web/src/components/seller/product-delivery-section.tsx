"use client";

import { useTranslations } from "next-intl";
import type { UseFormRegister } from "react-hook-form";
import { EditorSection } from "~/components/seller/editor-section";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import type { ProductFormState } from "~/lib/product-form";

export function ProductDeliverySection({
	register,
}: {
	register: UseFormRegister<ProductFormState>;
}) {
	const t = useTranslations("ProductEditor");

	return (
		<EditorSection title={t("saleAndDelivery")}>
			<div className="space-y-4">
				<label className="flex items-start gap-3">
					<input
						type="checkbox"
						className="mt-1 h-4 w-4 accent-[#1E40AF]"
						{...register("codAllowed")}
					/>
					<span>
						<span className="block font-medium text-[#0F172A] text-sm">
							{t("cod")}
						</span>
						<span className="block text-[#64748B] text-xs">{t("codHint")}</span>
					</span>
				</label>
				<label className="flex items-start gap-3">
					<input
						type="checkbox"
						className="mt-1 h-4 w-4 accent-[#1E40AF]"
						{...register("pickupAllowed")}
					/>
					<span>
						<span className="block font-medium text-[#0F172A] text-sm">
							{t("pickup")}
						</span>
						<span className="block text-[#64748B] text-xs">
							{t("pickupHint")}
						</span>
					</span>
				</label>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-1.5">
						<Label htmlFor="handling">{t("handlingHours")}</Label>
						<Input
							id="handling"
							inputMode="numeric"
							{...register("handlingHours")}
						/>
					</div>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="return-policy">{t("returnPolicy")}</Label>
					<Textarea
						id="return-policy"
						rows={2}
						placeholder={t("returnPolicyPlaceholder")}
						{...register("returnPolicy")}
					/>
				</div>
			</div>
		</EditorSection>
	);
}
