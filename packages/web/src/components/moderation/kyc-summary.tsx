import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { ReviewerRequestDetail } from "~/lib/verification";

type Kyc = NonNullable<ReviewerRequestDetail["request"]["kyc"]>;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-4 text-sm">
			<span className="text-[#64748B]">{label}</span>
			<span className="font-medium text-[#0F172A]">{value ?? "—"}</span>
		</div>
	);
}

/** The seller's identity-check outcome, level 2 only. Never the document bytes. */
export function KycSummary({ kyc }: { kyc: Kyc | null | undefined }) {
	const t = useTranslations("Moderation");
	const locale = useLocale();

	if (!kyc) return null;

	const expiresAt = kyc.documentExpiresAt
		? new Date(kyc.documentExpiresAt).toLocaleDateString(locale)
		: null;
	const fullName = [kyc.givenNames, kyc.familyName].filter(Boolean).join(" ");

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("review.kyc.title")}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				<Row
					label={t("review.kyc.outcome")}
					value={t(`review.kycStatus.${kyc.status ?? "not_started"}`)}
				/>
				<Row
					label={t("review.kyc.document")}
					value={
						kyc.documentType
							? `${t(`review.documentType.${kyc.documentType}`)} · ${kyc.documentCountry ?? "—"}`
							: null
					}
				/>
				<Row label={t("review.kyc.last4")} value={kyc.documentNumberLast4} />
				<Row label={t("review.kyc.expiry")} value={expiresAt} />
				<Row label={t("review.kyc.name")} value={fullName || null} />
				<Row
					label={t("review.kyc.liveness")}
					value={
						kyc.livenessPassed === null || kyc.livenessPassed === undefined
							? null
							: t(
									kyc.livenessPassed
										? "review.common.passed"
										: "review.common.failed",
								)
					}
				/>
				<Row
					label={t("review.kyc.faceMatch")}
					value={
						typeof kyc.faceMatchScore === "number"
							? `${Math.round(kyc.faceMatchScore * 100)}%`
							: null
					}
				/>
				{kyc.vendorReviewUrl && (
					<a
						href={kyc.vendorReviewUrl}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1 pt-1 font-medium text-[#1E40AF] text-sm hover:underline"
					>
						{t("review.kyc.vendorConsole")}
						<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
					</a>
				)}
			</CardContent>
		</Card>
	);
}
