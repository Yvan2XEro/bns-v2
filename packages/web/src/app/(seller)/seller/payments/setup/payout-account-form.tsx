"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { useSubmitPayoutAccount } from "~/hooks/use-seller-payments";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate } from "~/lib/order-money";
import { NAME_MATCH_RESULTS, PAYOUT_METHODS } from "~/lib/payment-status";
import {
	cooldownUntilOf,
	PAYOUT_METHOD_VALUES,
	type PayoutAccountFormValues,
	payoutAccountSchema,
} from "~/lib/payout-account-form";
import { useLocaleKey } from "~/lib/use-locale-key";

export function PayoutAccountForm({
	shopId,
	hasActiveAccount,
	payoutChangeHoldHours,
}: {
	shopId: string;
	/** An active payout account already exists: saving this form replaces it,
	 * which is the case the hold notice and "confirm the change" wording
	 * cover. First-time setup just saves. */
	hasActiveAccount: boolean;
	/** `PaymentSetupView.payoutChangeHoldHours` — the server's setting, never
	 * a client literal. */
	payoutChangeHoldHours: number;
}) {
	const t = useTranslations("Payments");
	const tRoot = useTranslations();
	const locale = useLocaleKey();
	const submit = useSubmitPayoutAccount(shopId);
	const {
		register,
		handleSubmit,
		setValue,
		watch,
		setError,
		formState: { errors, isSubmitting },
	} = useForm<PayoutAccountFormValues>({
		resolver: zodResolver(payoutAccountSchema),
		defaultValues: { method: "mtn_momo", accountName: "", accountNumber: "" },
	});
	const method = watch("method");

	const onValid = async (values: PayoutAccountFormValues) => {
		try {
			await submit.mutateAsync(values);
		} catch (error) {
			const until = cooldownUntilOf(error);
			if (until) {
				setError("root", {
					message: t("setup_cooldownUntil", {
						date: formatOrderDate(until, locale),
					}),
				});
				return;
			}
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	};

	return (
		<div className="space-y-3">
			{hasActiveAccount && (
				<p className="rounded-lg bg-[#FFFBEB] px-3 py-2 text-[#92400E] text-xs">
					{t("setup_changeNotice", { hours: payoutChangeHoldHours })}
				</p>
			)}
			<form onSubmit={handleSubmit(onValid)} className="space-y-4" noValidate>
				{errors.root?.message && (
					<p
						role="alert"
						className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
					>
						{errors.root.message}
					</p>
				)}
				{submit.isSuccess && submit.data.nameMatch && (
					<output className="block rounded-lg bg-[#F0FDF4] px-3 py-2 text-[#166534] text-sm">
						{t(NAME_MATCH_RESULTS[submit.data.nameMatch])}
					</output>
				)}

				<div className="space-y-1">
					<Label htmlFor="payout-method">{t("setup_payoutMethod")}</Label>
					<Select
						value={method}
						onValueChange={(value) => {
							if ((PAYOUT_METHOD_VALUES as readonly string[]).includes(value)) {
								setValue("method", value as PayoutAccountFormValues["method"]);
							}
						}}
					>
						<SelectTrigger id="payout-method">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PAYOUT_METHOD_VALUES.map((value) => (
								<SelectItem key={value} value={value}>
									{t(PAYOUT_METHODS[value])}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-1">
					<Label htmlFor="accountName">{t("setup_accountName")}</Label>
					<Input id="accountName" {...register("accountName")} />
					{errors.accountName && (
						<p className="text-red-600 text-xs">{errors.accountName.message}</p>
					)}
				</div>

				<div className="space-y-1">
					<Label htmlFor="accountNumber">{t("setup_accountNumber")}</Label>
					<Input id="accountNumber" {...register("accountNumber")} />
					{errors.accountNumber && (
						<p className="text-red-600 text-xs">
							{errors.accountNumber.message}
						</p>
					)}
				</div>

				<Button type="submit" disabled={isSubmitting || submit.isPending}>
					{hasActiveAccount ? t("setup_confirmChange") : t("setup_save")}
				</Button>
			</form>
		</div>
	);
}
