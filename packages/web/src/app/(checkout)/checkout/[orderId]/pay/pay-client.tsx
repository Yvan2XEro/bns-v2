"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import { useAppConfig } from "~/hooks/use-app-config";
import { useCreatePaymentIntent, usePaymentStatus } from "~/hooks/use-checkout";
import { useMarketPhone } from "~/hooks/use-market-phone";
import { availableActions, useCancelOrder } from "~/hooks/use-order-actions";
import { useOrderMoney } from "~/hooks/use-order-money";
import { usePurchase } from "~/hooks/use-purchases";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	codFallbackAllowed,
	type PayAttemptValues,
	payAttemptSchema,
} from "~/lib/payment-flow";
import { AttemptFields } from "../attempt-fields";
import { ProtectionSheet } from "./protection-sheet";

/**
 * The operator-choice screen. `usePaymentStatus` is read here only to catch
 * an attempt already in flight (a refresh, or a bookmark) and send the buyer
 * to `/pending` instead of letting them start a second one the server would
 * refuse with `payment.attemptInProgress`.
 */
export function PayClient({
	orderId,
	group,
}: {
	orderId: string;
	group: string | null;
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Payments");
	// Bound to no namespace, and called with full dotted paths, on purpose:
	// a second namespace-bound translator in this file would make the locale
	// gate (`messages-keys.test.ts`) cross-check every `Payments.*` call
	// above against that namespace too, and fail on the false positives.
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const router = useRouter();
	const groupParam = group ? `g=${encodeURIComponent(group)}` : "";
	const { protectedPaymentEnabled, buyerProtection } = useAppConfig();

	const purchase = usePurchase(orderId);
	const status = usePaymentStatus(orderId, purchase.isSuccess);
	const createIntent = useCreatePaymentIntent(orderId);
	const cancel = useCancelOrder({ orderId });
	const [sheetOpen, setSheetOpen] = useState(false);

	const order = purchase.data;
	const openIntent = status.data?.intent ?? null;

	const phoneRule = useMarketPhone();
	const { control, formState, handleSubmit, register, reset } =
		useForm<PayAttemptValues>({
			resolver: zodResolver(payAttemptSchema(phoneRule.pattern)),
			defaultValues: { phone: "" },
		});

	// The order's delivery phone is not known until the query resolves, so the
	// form's own `defaultValues` (read once, at mount) cannot carry it. This
	// seeds it exactly once, the moment the order first shows up, and never
	// again — so it never overwrites what the buyer has typed since.
	const seeded = useRef(false);
	useEffect(() => {
		if (order && !seeded.current) {
			seeded.current = true;
			reset({ phone: order.delivery.phone });
		}
	}, [order, reset]);

	// Any stored intent — pending, failed or settled — belongs on `/pending`,
	// which is the one screen built to render all of those; `/pay` is only
	// the entry point for an order with no attempt yet.
	useEffect(() => {
		if (openIntent) {
			router.replace(
				`/checkout/${encodeURIComponent(orderId)}/pending${groupParam ? `?${groupParam}` : ""}`,
			);
		}
	}, [openIntent, orderId, router, groupParam]);

	if (purchase.isPending || status.isPending) {
		return (
			<LoaderCircle className="mx-auto h-6 w-6 animate-spin text-ink-muted" />
		);
	}
	if (!order) {
		return (
			<p role="alert" className="text-red-700 text-sm">
				{resolveErrorMessage(purchase.error, tRoot)}
			</p>
		);
	}
	if (openIntent) {
		return (
			<LoaderCircle className="mx-auto h-6 w-6 animate-spin text-ink-muted" />
		);
	}

	const errorCode = createIntent.error?.code ?? null;
	const orderAllowsCod = availableActions(order, "buyer").includes("cancel");
	const offerCod = codFallbackAllowed(errorCode, orderAllowsCod);
	const formDisabled = errorCode === "payment.shopNotEligible";

	const onSubmit = handleSubmit(async (values) => {
		try {
			const idempotencyKey = crypto.randomUUID();
			const intent = await createIntent.mutateAsync({
				...values,
				idempotencyKey,
			});
			// `instructions` lives only on this response, never on the status
			// view `/pending` itself polls — carried over here so a prompt the
			// provider actually sent isn't replaced by the generic fallback.
			const params = [
				intent.instructions
					? `instructions=${encodeURIComponent(intent.instructions)}`
					: "",
				groupParam,
			].filter(Boolean);
			const suffix = params.length > 0 ? `?${params.join("&")}` : "";
			router.push(`/checkout/${encodeURIComponent(orderId)}/pending${suffix}`);
		} catch {
			// Surfaced below from `createIntent.error` — the server never names a
			// field here, so there is nothing to attach to the form itself.
		}
	});

	const payOnDelivery = async () => {
		await cancel.mutateAsync({ reason: "buyer_changed_mind" });
		router.push("/purchases");
	};

	return (
		<div className="space-y-6">
			<header className="space-y-1">
				<h1 className="font-bold text-2xl text-ink">{t("pay_title")}</h1>
				<p className="font-semibold text-ink text-xl">
					{formatOrderMoney(order.amounts.total, locale)}
				</p>
			</header>

			{!protectedPaymentEnabled && (
				<p className="text-ink-muted text-sm">{t("comingSoon")}</p>
			)}

			{protectedPaymentEnabled && (
				<>
					<p className="text-ink-soft text-sm">
						{t("disclosure_listingBadge", {
							rate: buyerProtection.bps / 100,
							min: formatOrderMoney(buyerProtection.min),
						})}
					</p>
					<button
						type="button"
						className="min-h-11 text-brand text-sm underline"
						onClick={() => setSheetOpen(true)}
					>
						{t("summary_coverLink")}
					</button>
					<ProtectionSheet open={sheetOpen} onOpenChange={setSheetOpen} />

					<form onSubmit={onSubmit} className="space-y-4" noValidate>
						<AttemptFields
							control={control}
							register={register}
							errors={formState.errors}
							disabled={formDisabled}
						/>

						{errorCode && (
							<p role="alert" className="text-red-700 text-sm">
								{resolveErrorMessage(createIntent.error, tRoot)}
							</p>
						)}

						{formDisabled ? (
							offerCod && (
								<Button
									type="button"
									variant="outline"
									className="min-h-12 w-full"
									disabled={cancel.isPending}
									onClick={() => void payOnDelivery()}
								>
									{t("pay_payOnDelivery")}
								</Button>
							)
						) : (
							<Button
								type="submit"
								className="min-h-12 w-full bg-brand-fill text-base hover:bg-brand-strong"
								disabled={createIntent.isPending}
							>
								{createIntent.isPending && (
									<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
								)}
								{t("pay_submit", {
									amount: formatOrderMoney(order.amounts.total, locale),
								})}
							</Button>
						)}
					</form>
				</>
			)}
		</div>
	);
}
