"use client";

import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import { resolveErrorMessage } from "~/lib/apiError";
import type { DocumentKind } from "~/lib/verification";

export interface SubmitPanelProps {
	ready: boolean;
	formValid: boolean;
	missing: DocumentKind[];
	isSubmitting: boolean;
	submitError: unknown;
	onSubmit: () => void;
	onReviewBusiness: () => void;
}

/**
 * The submit-for-review footer under the business/documents tabs. A disabled
 * button with nothing explaining why is its own defect: an invalid business
 * form (missing legal name, wrong NIU shape, …) and missing documents are
 * different problems with different fixes, so each gets its own message.
 */
export function SubmitPanel({
	ready,
	formValid,
	missing,
	isSubmitting,
	submitError,
	onSubmit,
	onReviewBusiness,
}: SubmitPanelProps) {
	const t = useTranslations("Verification");
	const tRoot = useTranslations();

	return (
		<div className="space-y-2 border-[#E2E8F0] border-t pt-4">
			{!ready && !formValid && (
				<div className="space-y-2">
					<p role="alert" className="text-red-600 text-sm">
						{t("documents.incompleteBusiness")}
					</p>
					<Button type="button" variant="outline" onClick={onReviewBusiness}>
						{t("documents.reviewBusiness")}
					</Button>
				</div>
			)}
			{!ready && formValid && missing.length > 0 && (
				<p className="text-[#64748B] text-sm">
					{t("documents.missing", {
						kinds: missing.map((kind) => t(`documentKind.${kind}`)).join(", "),
					})}
				</p>
			)}
			{submitError !== null && submitError !== undefined && (
				<p role="alert" className="text-red-600 text-sm">
					{resolveErrorMessage(submitError, tRoot)}
				</p>
			)}
			<Button
				type="button"
				disabled={!ready || isSubmitting}
				onClick={onSubmit}
			>
				{isSubmitting ? t("documents.submitting") : t("documents.submit")}
			</Button>
		</div>
	);
}
