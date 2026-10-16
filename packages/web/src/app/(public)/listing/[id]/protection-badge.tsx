"use client";

import { ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { useOrderMoney } from "~/hooks/use-order-money";
import { protectionBadgeCopy } from "~/lib/payment-disclosure";

/**
 * The disclosure next to the price, spec copy verbatim via `{rate}`/`{min}`.
 * Its own file, with its own single namespace — `buy-box.tsx` reads from
 * `BuyBox`, and `messages-keys.test.ts` cross-multiplies every namespace a
 * file declares against every translated call in it, so a `Payments` call
 * living inside that file would mint a false "missing" entry for each of
 * its `BuyBox` keys (and vice versa).
 */
export function ProtectionBadge() {
	const t = useTranslations("Payments");
	const locale = useLocale() === "en" ? "en" : "fr";
	const { buyerProtection } = useAppConfig();
	const formatOrderMoney = useOrderMoney();
	const { rate, min } = protectionBadgeCopy(
		buyerProtection,
		locale,
		formatOrderMoney,
	);
	return (
		<div className="mt-4 flex items-start gap-2 rounded-xl border border-ok-line bg-ok-faint p-3 text-sm">
			<ShieldCheck
				aria-hidden="true"
				className="mt-0.5 h-4 w-4 shrink-0 text-ok-ink"
			/>
			<p className="text-ok-ink">
				{t("disclosure_listingBadge", { rate, min })}
			</p>
		</div>
	);
}
