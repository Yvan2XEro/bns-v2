import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { ReviewerRequestDetail } from "~/lib/verification";

type Business = NonNullable<ReviewerRequestDetail["request"]["business"]>;
type ReviewSignals = ReviewerRequestDetail["request"]["reviewSignals"];

function Row({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-4 text-sm">
			<span className="text-[#64748B]">{label}</span>
			<span className="font-medium text-[#0F172A]">{value ?? "—"}</span>
		</div>
	);
}

/** The seller's registry details, level 3 only. */
export function BusinessSummary({
	business,
	signals,
}: {
	business: Business | null | undefined;
	signals: ReviewSignals;
}) {
	const t = useTranslations("Moderation");

	if (!business) return null;

	const niuFlagged = signals.some((signal) => signal.code === "niu_format");

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("review.business.title")}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				<Row
					label={t("review.business.type")}
					value={
						business.businessType
							? t(`review.businessType.${business.businessType}`)
							: null
					}
				/>
				<Row
					label={t("review.business.legalName")}
					value={business.legalName}
				/>
				<Row
					label={t("review.business.tradeName")}
					value={business.tradeName}
				/>
				<Row label={t("review.business.rccm")} value={business.rccmNumber} />
				<Row
					label={t("review.business.entreprenantNumber")}
					value={business.entreprenantDeclarationNumber}
				/>
				<div className="flex items-baseline justify-between gap-4 text-sm">
					<span className="text-[#64748B]">{t("review.business.niu")}</span>
					<span className="flex items-center gap-1.5 font-medium text-[#0F172A]">
						{business.niu ?? "—"}
						{niuFlagged && (
							<span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[#92400E] text-xs">
								<AlertTriangle aria-hidden="true" className="h-3 w-3" />
								{t("review.business.niuFormatWarning")}
							</span>
						)}
					</span>
				</div>
				<Row
					label={t("review.business.address")}
					value={business.registeredAddress}
				/>
				<Row label={t("review.business.city")} value={business.city} />
				<Row
					label={t("review.business.representative")}
					value={business.legalRepresentativeName}
				/>
				<Row
					label={t("review.business.representativeIsOwner")}
					value={t(
						business.legalRepresentativeIsOwner
							? "review.common.yes"
							: "review.common.no",
					)}
				/>
			</CardContent>
		</Card>
	);
}
