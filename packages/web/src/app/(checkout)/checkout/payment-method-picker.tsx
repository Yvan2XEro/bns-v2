"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatXaf } from "~/lib/order-money";
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
}: {
	method: PaymentMethod;
	fee: number | null;
	onChoose: (method: PaymentMethod) => void;
}) {
	const t = useTranslations("Payments");
	const locale = useLocale() === "en" ? "en" : "fr";

	const options: Array<{ value: PaymentMethod; title: string; body: string }> =
		[
			{ value: "cod", title: t("method_cod"), body: t("method_codBody") },
			{
				value: "mobile_money",
				title: t("method_protected"),
				body: t("method_protectedBody"),
			},
		];

	return (
		<fieldset className="space-y-3 rounded-2xl border border-[#E2E8F0] p-4">
			<legend className="px-1 font-semibold text-[#0F172A]">
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
								active
									? "border-[#1E40AF] bg-[#EFF6FF]"
									: "border-[#E2E8F0] bg-white"
							}`}
						>
							<p className="font-medium text-[#0F172A]">{option.title}</p>
							<p className="text-[#64748B] text-xs">{option.body}</p>
							{option.value === "mobile_money" && fee !== null && (
								<p className="mt-1 font-medium text-[#1E40AF] text-xs">
									{t("method_protectedFee", { fee: formatXaf(fee, locale) })}
								</p>
							)}
						</button>
					);
				})}
			</div>
		</fieldset>
	);
}
