import { BadgeCheck, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	businessTypeLabelKey,
	isBusinessType,
	legalBlockLines,
} from "~/lib/shop-legal";
import type { ShopLegal } from "~/types";

/**
 * A shop's declared or reviewed legal identity — renders nothing below level
 * 3 or with nothing declared. `verified` is the server's own capability
 * (`PublicShop.legalVerified`), never derived here from `legal.verifiedAt`.
 */
export function LegalBlock({
	legal,
	verified,
}: {
	legal: ShopLegal | null;
	verified: boolean;
}) {
	const t = useTranslations("Shop");
	const lines = legalBlockLines(legal);
	if (lines.length === 0) return null;

	return (
		<div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
			<div className="flex items-center gap-2">
				{verified ? (
					<BadgeCheck className="h-4 w-4 text-[#047857]" aria-hidden="true" />
				) : (
					<FileText className="h-4 w-4 text-[#64748B]" aria-hidden="true" />
				)}
				<h2 className="font-bold text-[#0F172A]">
					{verified ? t("legalVerifiedTitle") : t("legalDeclaredTitle")}
				</h2>
			</div>
			<dl className="mt-3 space-y-2 text-sm">
				{lines.map((line) => (
					<div
						key={line.label}
						className="flex items-baseline justify-between gap-3"
					>
						<dt className="shrink-0 text-[#64748B]">{t(line.label)}</dt>
						<dd className="truncate text-right font-medium text-[#0F172A]">
							{line.label === "businessType" && isBusinessType(line.value)
								? t(businessTypeLabelKey(line.value))
								: line.value}
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
