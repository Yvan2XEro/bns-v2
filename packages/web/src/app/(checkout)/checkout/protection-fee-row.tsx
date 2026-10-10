"use client";

import { useTranslations } from "next-intl";

/**
 * Its own file, with its own single namespace: `messages-keys.test.ts`
 * cross-multiplies every namespace a file declares against every translated
 * call in it, so a `Payments` translation living inside `order-summary.tsx`
 * (which reads from `Checkout`) would mint a false "missing" entry for
 * every one of that file's existing `Checkout` keys.
 */
export function ProtectionFeeRow({ amount }: { amount: string }) {
	const t = useTranslations("Payments");
	return (
		<div className="flex justify-between">
			<dt>{t("summary_protectionFee")}</dt>
			<dd>{amount}</dd>
		</div>
	);
}
