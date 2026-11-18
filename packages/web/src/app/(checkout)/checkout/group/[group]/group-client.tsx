"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import { useCheckoutGroup } from "~/hooks/use-checkout-group";
import { useOrderMoney } from "~/hooks/use-order-money";
import { resolveErrorMessage } from "~/lib/apiError";
import { checkoutGroupFlow } from "~/lib/checkout-group-flow";

const STATE_KEYS = {
	paid: "statePaid",
	expired: "stateExpired",
	pending: "statePending",
} as const;

/** The per-order stepper: one sibling is payable at a time, and a failed one never blocks the rest. */
export function GroupClient({ group }: { group: string }) {
	const t = useTranslations("CheckoutGroup");
	const tRoot = useTranslations();
	const formatOrderMoney = useOrderMoney();
	const locale = useLocale() === "en" ? "en" : "fr";
	const view = useCheckoutGroup(group);

	if (view.isPending) {
		return (
			<LoaderCircle className="mx-auto h-6 w-6 animate-spin text-ink-muted" />
		);
	}
	if (view.isError) {
		return (
			<div role="alert" className="space-y-3 text-center">
				<p className="text-ink">{resolveErrorMessage(view.error, tRoot)}</p>
				<Button className="min-h-11" onClick={() => void view.refetch()}>
					{t("retry")}
				</Button>
			</div>
		);
	}

	const flow = checkoutGroupFlow(view.data);
	const next = flow.nextPayable;
	const nextOrder = view.data.orders.find((o) => o.id === next?.orderId);

	return (
		<div className="space-y-6">
			<h1 className="font-bold text-2xl text-ink">{t("groupTitle")}</h1>

			{next && nextOrder?.paymentMethod === "mobile_money" ? (
				<section className="space-y-3 rounded-2xl border border-brand-tint-strong bg-brand-soft p-5">
					<p className="text-brand text-sm">
						{t("stepperPosition", { n: next.position, total: flow.total })}
					</p>
					<p className="font-semibold text-ink">
						{t("payThisOrder", { orderNumber: next.orderNumber })}
					</p>
					<p className="text-ink-soft text-sm">{t("payNoCode")}</p>
					<Button asChild className="min-h-11 w-full">
						<Link
							href={`/checkout/${encodeURIComponent(next.orderId)}/pay?g=${encodeURIComponent(group)}`}
						>
							{t("payThisOrder", { orderNumber: next.orderNumber })}
						</Link>
					</Button>
				</section>
			) : null}

			<ul className="space-y-3">
				{view.data.orders.map((order, index) => {
					const step = flow.steps[index];
					if (!step) return null;
					const href =
						order.paymentMethod === "cod" && step.state === "pending"
							? `/checkout/confirmation/${encodeURIComponent(order.id)}`
							: `/purchases/${encodeURIComponent(order.id)}`;
					return (
						<li key={order.id}>
							<Link
								href={href}
								className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-brand-line"
							>
								<span className="min-w-0">
									<span className="block truncate font-semibold text-ink">
										{order.shop.name}
									</span>
									<span className="block text-ink-muted text-sm">
										{order.orderNumber}
									</span>
								</span>
								<span className="shrink-0 text-right">
									<span className="block font-semibold text-ink">
										{formatOrderMoney(order.total, locale)}
									</span>
									<span className="block text-ink-muted text-xs">
										{t(STATE_KEYS[step.state])}
									</span>
								</span>
							</Link>
						</li>
					);
				})}
			</ul>

			<p className="text-ink-soft text-sm">
				{t("summaryPaid", { count: flow.summary.paid })} ·{" "}
				{t("summaryExpired", { count: flow.summary.expired })} ·{" "}
				{t("summaryPending", { count: flow.summary.pending })}
			</p>

			<Button asChild variant="outline" className="min-h-11 w-full">
				<Link href="/purchases">{t("viewPurchases")}</Link>
			</Button>
		</div>
	);
}
