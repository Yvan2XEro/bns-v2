"use client";

import { ArrowLeft, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useAppConfig } from "~/hooks/use-app-config";
import { availableActions } from "~/hooks/use-order-actions";
import { usePurchase } from "~/hooks/use-purchases";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate } from "~/lib/order-money";
import { StatusLabel } from "../status-label";
import { useNow } from "../use-now";
import { ActionBar, type BarDialog } from "./action-bar";
import { CancelDialog } from "./cancel-dialog";
import { ConfirmCodeForm } from "./confirm-code-form";
import { ConfirmReceiptDialog } from "./confirm-receipt-dialog";
import { ContestDialog } from "./contest-dialog";
import { HandoverCard } from "./handover-card";
import { PaymentSection } from "./payment-section";
import { PurchaseSummary } from "./purchase-summary";
import { ReviewPanel } from "./review-panel";
import { Timeline } from "./timeline";
import { WithdrawalDialog, WithdrawalWindow } from "./withdrawal-dialog";

export function PurchaseClient({ orderId }: { orderId: string }) {
	const t = useTranslations("Purchases");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const purchase = usePurchase(orderId);
	const { disputesEnabled } = useAppConfig();
	const now = useNow();
	const [dialog, setDialog] = useState<BarDialog | null>(null);

	if (purchase.isPending) {
		return (
			<div className="mx-auto max-w-3xl space-y-3 px-4 py-8">
				<div className="h-10 w-64 animate-pulse rounded-xl bg-[#F1F5F9]" />
				<div className="h-48 animate-pulse rounded-2xl bg-[#F1F5F9]" />
			</div>
		);
	}
	if (purchase.isError) {
		return (
			<div
				role="alert"
				className="mx-auto max-w-3xl space-y-3 px-4 py-12 text-center"
			>
				<p>{resolveErrorMessage(purchase.error, tRoot)}</p>
				<Button onClick={() => void purchase.refetch()}>{t("retry")}</Button>
			</div>
		);
	}

	const order = purchase.data;
	const actions = availableActions(order, "buyer", null, now);
	const has = (action: (typeof actions)[number]) => actions.includes(action);
	const control = (name: BarDialog) => ({
		open: dialog === name && has(name),
		onOpenChange: (open: boolean) => setDialog(open ? name : null),
	});

	return (
		<div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
			<Link
				href="/purchases"
				className="inline-flex min-h-11 items-center gap-2 text-[#1E40AF] text-sm"
			>
				<ArrowLeft className="h-4 w-4" aria-hidden /> {t("back")}
			</Link>

			<header className="space-y-2">
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="font-bold text-2xl text-[#0F172A]">
						{t("orderNumber", { number: order.orderNumber })}
					</h1>
					<StatusLabel status={order.status} />
				</div>
				<p className="text-[#64748B] text-sm">
					{t("placedOn", {
						date: formatOrderDate(order.timestamps.placedAt, locale),
					})}{" "}
					· {t("soldBy", { shop: order.shop.name })}
				</p>
			</header>

			<ActionBar orderId={order.id} actions={actions} onOpen={setDialog} />

			{disputesEnabled ? (
				<Button variant="outline" className="min-h-11" asChild>
					<Link href={`/purchases/${encodeURIComponent(order.id)}/problem`}>
						{t("reportProblem")}
					</Link>
				</Button>
			) : (
				<Button variant="outline" className="min-h-11" asChild>
					<Link
						href={`/contact?order=${encodeURIComponent(order.orderNumber)}`}
					>
						{t("reportProblem")}
					</Link>
				</Button>
			)}

			{(has("confirm_code") || has("resend_code")) && (
				<ConfirmCodeForm
					orderId={order.id}
					canConfirm={has("confirm_code")}
					canResend={has("resend_code")}
				/>
			)}

			{order.status === "shipped" && (
				<HandoverCard order={order} actions={actions} />
			)}

			<WithdrawalWindow order={order} now={now} />

			{has("review_shop") && (
				<ReviewPanel orderId={order.id} shopName={order.shop.name} />
			)}

			{order.conversationId && (
				<Button variant="secondary" className="min-h-11" asChild>
					<Link
						href={`/messages?conversation=${encodeURIComponent(order.conversationId)}`}
					>
						<MessageCircle aria-hidden /> {t("openConversation")}
					</Link>
				</Button>
			)}

			<PaymentSection order={order} />
			<PurchaseSummary order={order} />
			<Timeline entries={order.timeline} />

			<CancelDialog orderId={order.id} {...control("cancel")} />
			<ConfirmReceiptDialog
				orderId={order.id}
				{...control("confirm_receipt")}
			/>
			<ContestDialog
				orderId={order.id}
				contestBy={order.deadlines.contestBy}
				{...control("contest_delivery")}
			/>
			{has("request_withdrawal") && (
				<WithdrawalDialog order={order} {...control("request_withdrawal")} />
			)}
		</div>
	);
}
