"use client";

import { useLocale, useTranslations } from "next-intl";
import { useOrderMoney } from "~/hooks/use-order-money";
import type { PaymentMethod } from "~/types/order";

/**
 * COD vs protected payment, shown only while `protectedPaymentEnabled` is
 * true (the caller decides that, never this component). `fee` is this
 * order's own buyer protection fee once a quote under `mobile_money` has
 * answered — never computed here, so the card shows nothing until the
 * server has actually priced it.
 */
export function PaymentMethodPicker({
	method,
	fee,
	onChoose,
	codOnly = false,
	embedded = false,
}: {
	method: PaymentMethod;
	fee: number | null;
	onChoose: (method: PaymentMethod) => void;
	/** Protected payment is off: the one method left is shown, not hidden. */
	codOnly?: boolean;
	/** Inside a checkout section that already titles it. */
	embedded?: boolean;
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Payments");
	const locale = useLocale() === "en" ? "en" : "fr";

	const all: Array<{ value: PaymentMethod; title: string; body: string }> = [
		{ value: "cod", title: t("method_cod"), body: t("method_codBody") },
		{
			value: "mobile_money",
			title: t("method_protected"),
			body: t("method_protectedBody"),
		},
	];
	const options = codOnly ? all.filter((o) => o.value === "cod") : all;

	return (
		<fieldset
			className={
				embedded ? "space-y-3" : "space-y-3 rounded-2xl border border-line p-4"
			}
		>
			<legend className={embedded ? "sr-only" : "px-1 font-semibold text-ink"}>
				{t("method_title")}
			</legend>
			<div className="grid gap-2 sm:grid-cols-2">
				{options.map((option) => {
					const active = option.value === method;
					return (
						<button
							key={option.value}
							type="button"
							aria-pressed={active}
							onClick={() => onChoose(option.value)}
							className={`min-h-11 rounded-xl border p-3 text-left text-sm ${
								active ? "border-brand bg-brand-soft" : "border-line bg-surface"
							}`}
						>
							<p className="font-medium text-ink">{option.title}</p>
							<p className="text-ink-muted text-xs">{option.body}</p>
							{option.value === "mobile_money" && fee !== null && (
								<p className="mt-1 font-medium text-brand text-xs">
									{t("method_protectedFee", {
										fee: formatOrderMoney(fee, locale),
									})}
								</p>
							)}
						</button>
					);
				})}
			</div>
		</fieldset>
	);
}
