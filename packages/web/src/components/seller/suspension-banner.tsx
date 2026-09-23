import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MyShop } from "~/types";

const REASONS = new Set([
	"spam",
	"inappropriate",
	"fraud",
	"prohibited",
	"harassment",
	"other",
]);

export function SuspensionBanner({
	shop,
	locale,
}: {
	shop: MyShop;
	locale: string;
}) {
	const t = useTranslations("Seller");
	if (shop.status !== "suspended") return null;
	const suspension = shop.suspension;
	const until = suspension?.until
		? new Date(suspension.until).toLocaleDateString(locale, {
				day: "numeric",
				month: "long",
				year: "numeric",
			})
		: null;
	const reason =
		suspension?.reason && REASONS.has(suspension.reason)
			? t(`suspensionReason.${suspension.reason}`)
			: null;

	return (
		<div className="flex items-start gap-3 border-[#fecaca] border-b bg-[#fef2f2] px-6 py-4 text-[#991b1b]">
			<Ban aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
			<div className="text-sm">
				<p className="font-semibold">
					{until
						? t("suspendedUntil", { date: until })
						: t("suspendedIndefinitely")}
				</p>
				{reason && <p>{t("suspendedReason", { reason })}</p>}
				<p className="mt-1 text-[#7f1d1d]">{t("suspendedBody")}</p>
			</div>
		</div>
	);
}
