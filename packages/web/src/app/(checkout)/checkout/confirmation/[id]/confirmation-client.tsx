"use client";

import { CheckCircle2, LoaderCircle, Phone } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import { availableActions, orderReceiptUrl } from "~/hooks/use-order-actions";
import { useOrderMoney } from "~/hooks/use-order-money";
import { usePurchase } from "~/hooks/use-purchases";
import { resolveErrorMessage } from "~/lib/apiError";
import { confirmationOutcome } from "~/lib/checkout-form";
import type { ConfirmationRequired } from "~/types/order";
import { CodeEntry } from "./code-entry";

/**
 * The receipt view (art. 19) and whatever confirmation the order still owes.
 * The placement's `confirmationRequired` picks the outcome until the order
 * loads; after that the order's own `confirmation.required` does, so a
 * confirmed code moves the screen on without a reload.
 */
export function ConfirmationClient({
	orderId,
	placedHint,
}: {
	orderId: string;
	placedHint: ConfirmationRequired | null;
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Checkout");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const purchase = usePurchase(orderId);
	const order = purchase.data;
	const outcome = confirmationOutcome(
		order?.confirmation.required ?? placedHint,
	);

	if (purchase.isPending) {
		return (
			<p className="flex items-center gap-2 text-ink-muted text-sm">
				<LoaderCircle className="h-4 w-4 animate-spin" />
				{t("loadingOrder")}
			</p>
		);
	}
	if (!order) {
		return (
			<p role="alert" className="text-red-700 text-sm">
				{resolveErrorMessage(purchase.error, tRoot)}
			</p>
		);
	}

	return (
		<div className="space-y-6">
			<header className="space-y-2 text-center">
				{outcome === "confirmed" ? (
					<CheckCircle2 className="mx-auto h-12 w-12 text-ok" />
				) : (
					<Phone className="mx-auto h-12 w-12 text-brand" />
				)}
				<h1 className="font-bold text-2xl text-ink">
					{t("orderReceived", { number: order.orderNumber })}
				</h1>
				<p className="text-ink-soft text-sm">{t("total")}</p>
				<p className="font-semibold text-ink text-xl">
					{formatOrderMoney(order.amounts.total, locale)}
				</p>
			</header>

			<section className="rounded-2xl border border-line p-4">
				{outcome === "confirmed" && (
					<div className="space-y-1">
						<p className="font-semibold text-ok-ink">{t("confirmed")}</p>
						<p className="text-ink-soft text-sm">
							{order.confirmation.method === "verified_phone"
								? t("autoConfirmedBody")
								: t("confirmedBody")}
						</p>
					</div>
				)}
				{outcome === "seller_call" && (
					<div className="space-y-1">
						<p className="font-semibold text-ink">
							{t("confirmationNeededCall")}
						</p>
						<p className="text-ink-soft text-sm">{t("sellerCallBody")}</p>
					</div>
				)}
				{outcome === "code" && (
					<div className="space-y-2">
						<p className="font-semibold text-ink">
							{t("confirmationNeededCode")}
						</p>
						<CodeEntry
							order={order}
							onAttempt={() => void purchase.refetch()}
						/>
					</div>
				)}
			</section>

			<div className="flex flex-col gap-3 sm:flex-row">
				<Button
					asChild
					className="min-h-11 flex-1 bg-brand hover:bg-brand-strong"
				>
					<Link href={`/purchases/${encodeURIComponent(order.id)}`}>
						{t("viewOrder")}
					</Link>
				</Button>
				{availableActions(order, "buyer").includes("receipt") && (
					<Button asChild variant="outline" className="min-h-11 flex-1">
						<a
							href={orderReceiptUrl(order.id, locale)}
							target="_blank"
							rel="noopener noreferrer"
						>
							{t("printReceipt")}
						</a>
					</Button>
				)}
			</div>
		</div>
	);
}
