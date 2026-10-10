"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
	orderReceiptUrl,
	useAcceptOrder,
	useConfirmByCall,
	useShipOrder,
} from "~/hooks/use-order-actions";
import { useOrderShipments } from "~/hooks/use-shop-shipments";
import { resolveErrorMessage } from "~/lib/apiError";
import type { ShopRole } from "~/types";
import type { OrderView } from "~/types/order";
import {
	actionBarItems,
	type DialogAction,
	isPostAction,
} from "../seller-orders";
import { DeclareDeliveredDialog } from "./declare-delivered-dialog";
import { DeclineDialog } from "./decline-dialog";
import { FailureDialog } from "./failure-dialog";
import { HandoverDialog, HandoverFallbacks } from "./handover-dialog";

const VARIANTS = {
	primary: "default",
	secondary: "outline",
	danger: "destructive",
} as const;

/**
 * Renders `actionBarItems` — which is `availableActions(order, "shop", role)`
 * — and nothing it does not list. The only state here is which dialog is
 * open; every button's presence is the action table's answer.
 */
export function ActionBar({
	order,
	shopId,
	role,
	roleLoading,
	onHandoverFailed,
}: {
	order: OrderView;
	shopId: string;
	role: ShopRole | null;
	roleLoading: boolean;
	onHandoverFailed: () => void;
}) {
	const t = useTranslations("SellerOrders");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const [dialog, setDialog] = useState<DialogAction | null>(null);

	const target = { orderId: order.id, shopId };
	const accept = useAcceptOrder(target);
	const ship = useShipOrder(target);
	const confirmByCall = useConfirmByCall(target);
	const posts = { accept, ship, confirm_by_call: confirmByCall };
	const failed = [accept, ship, confirmByCall].find((m) => m.isError);
	const pending = [accept, ship, confirmByCall].some((m) => m.isPending);

	const shipments = useOrderShipments(shopId, order.id, order.status);
	const liveShipment = (shipments.data ?? []).some(
		(shipment) => shipment.status !== "cancelled",
	);
	const items = actionBarItems(order, role, new Date(), liveShipment);
	const canDeclare = items.some((item) => item.action === "declare_delivered");
	const close = () => setDialog(null);

	return (
		<aside
			aria-labelledby="action-bar-title"
			className="h-fit space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-5 lg:sticky lg:top-4"
		>
			<h2 id="action-bar-title" className="font-semibold text-[#0F172A]">
				{t("actions")}
			</h2>

			{order.handover.locked && canDeclare && (
				<div className="space-y-2 rounded-lg bg-amber-50 p-3 text-amber-900 text-sm">
					<p className="font-semibold">{t("handoverLocked")}</p>
					<HandoverFallbacks />
				</div>
			)}

			{roleLoading ? (
				<span className="block h-11 animate-pulse rounded-lg bg-[#F1F5F9]" />
			) : (
				<div className="flex flex-col gap-2">
					{items.map(({ action, tone, labelKey }) => {
						if (action === "receipt") {
							return (
								<a
									key={action}
									href={orderReceiptUrl(order.id, locale)}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#DBEAFE] px-4 font-medium text-sm hover:bg-[#EFF6FF]"
								>
									{t(labelKey)}
								</a>
							);
						}
						const onClick = isPostAction(action)
							? () => posts[action].mutate()
							: () => setDialog(action);
						return (
							<Button
								key={action}
								type="button"
								variant={VARIANTS[tone]}
								className="min-h-11"
								disabled={pending}
								onClick={onClick}
							>
								{t(labelKey)}
							</Button>
						);
					})}
					{items.length === 0 && (
						<p className="text-[#64748B] text-sm">{t("noActions")}</p>
					)}
				</div>
			)}

			{failed && (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(failed.error, tRoot, t("actionFailed"))}
				</p>
			)}

			<DeclineDialog
				mode={dialog === "seller_cancel" ? "seller_cancel" : "decline"}
				open={dialog === "decline" || dialog === "seller_cancel"}
				target={target}
				onClose={close}
			/>
			<FailureDialog
				mode={
					dialog === "mark_delivery_failed"
						? "mark_delivery_failed"
						: "report_failed_attempt"
				}
				open={
					dialog === "report_failed_attempt" ||
					dialog === "mark_delivery_failed"
				}
				target={target}
				onClose={close}
			/>
			<DeclareDeliveredDialog
				open={dialog === "declare_delivered"}
				target={target}
				onClose={close}
			/>
			<HandoverDialog
				open={dialog === "handover"}
				handover={order.handover}
				target={target}
				canDeclare={canDeclare}
				onFailed={onHandoverFailed}
				onClose={close}
			/>
		</aside>
	);
}
