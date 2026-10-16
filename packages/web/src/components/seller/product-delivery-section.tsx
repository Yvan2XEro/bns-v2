"use client";

import { useTranslations } from "next-intl";
import type { UseFormRegister } from "react-hook-form";
import { EditorSection } from "~/components/seller/editor-section";
import {
	type IssueAt,
	ProductIssueText,
} from "~/components/seller/product-issue-text";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import type { ProductFormState } from "~/lib/product-form";

export function ProductDeliverySection({
	register,
	issueAt,
}: {
	register: UseFormRegister<ProductFormState>;
	issueAt: IssueAt;
}) {
	const t = useTranslations("ProductEditor");

	return (
		<EditorSection title={t("saleAndDelivery")}>
			<div className="space-y-4">
				<label className="flex items-start gap-3">
					<input
						type="checkbox"
						className="mt-1 h-4 w-4 accent-[var(--shop-accent,var(--c-brand))]"
						{...register("codAllowed")}
					/>
					<span>
						<span className="block font-medium text-ink text-sm">
							{t("cod")}
						</span>
						<span className="block text-ink-muted text-xs">{t("codHint")}</span>
					</span>
				</label>
				<label className="flex items-start gap-3">
					<input
						type="checkbox"
						className="mt-1 h-4 w-4 accent-[var(--shop-accent,var(--c-brand))]"
						{...register("pickupAllowed")}
					/>
					<span>
						<span className="block font-medium text-ink text-sm">
							{t("pickup")}
						</span>
						<span className="block text-ink-muted text-xs">
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
							aria-invalid={Boolean(issueAt("handlingHours"))}
							{...register("handlingHours")}
						/>
						<ProductIssueText issue={issueAt("handlingHours")} />
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="warranty">{t("warrantyMonths")}</Label>
						<Input
							id="warranty"
							inputMode="numeric"
							aria-describedby="warranty-hint"
							aria-invalid={Boolean(issueAt("warrantyMonths"))}
							{...register("warrantyMonths")}
						/>
						<ProductIssueText issue={issueAt("warrantyMonths")} />
						<p id="warranty-hint" className="text-ink-muted text-xs">
							{t("warrantyMonthsHint")}
						</p>
					</div>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="return-policy">{t("returnPolicy")}</Label>
					<Textarea
						id="return-policy"
						rows={2}
						placeholder={t("returnPolicyPlaceholder")}
						aria-invalid={Boolean(issueAt("returnPolicy"))}
						{...register("returnPolicy")}
					/>
					<ProductIssueText issue={issueAt("returnPolicy")} />
				</div>
			</div>
		</EditorSection>
	);
}
