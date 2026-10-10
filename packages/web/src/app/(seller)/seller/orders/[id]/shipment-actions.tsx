"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useShipmentAction } from "~/hooks/use-shop-shipments";
import { resolveErrorMessage } from "~/lib/apiError";
import { type PanelAction, panelActions } from "~/lib/shipment-panel";
import { can } from "~/lib/shop-roles";
import type { ShopRole } from "~/types";
import type { ShopShipmentView } from "../../../../../../../api/src/contracts/shipments";
import { ShipmentCarrierDialog } from "./shipment-carrier-dialog";
import {
	ShipmentDeclareDialog,
	ShipmentHandoverDialog,
} from "./shipment-code-dialogs";
import { ShipmentReasonDialog } from "./shipment-reason-dialog";
import { ShipmentRescheduleDialog as ShipmentReschedule } from "./shipment-reschedule-dialog";
import { ShipmentRiderDialog } from "./shipment-rider-dialog";

/** Actions that post straight away; everything else opens its own dialog first. */
const DIRECT: readonly PanelAction[] = ["start", "ready_for_pickup"];

/**
 * Renders `panelActions` and nothing it does not list; the only state is
 * which dialog is open. `rider_link` and `confirm_remittance` have cards of
 * their own, so they have no button here.
 */
export function ShipmentActions({
	shopId,
	orderId,
	shipment,
	role,
	cod,
	now,
}: {
	shopId: string;
	orderId: string;
	shipment: ShopShipmentView;
	role: ShopRole | null;
	cod: boolean;
	now: Date;
}) {
	const t = useTranslations("SellerShipments");
	const tRoot = useTranslations();
	const [dialog, setDialog] = useState<PanelAction | null>(null);
	const direct = useShipmentAction(shopId, orderId);
	const actions = panelActions(shipment, {
		costsView: can(role, "costs.view"),
	}).filter(
		(action) => action !== "rider_link" && action !== "confirm_remittance",
	);
	const close = () => setDialog(null);
	const common = { shopId, orderId, shipmentId: shipment.id, onClose: close };
	const finalFailure = Boolean(shipment.finalFailure?.at);

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-2">
				{actions.map((action) => (
					<Button
						key={action}
						variant={
							action === "report_attempt" || action === "mark_returned"
								? "outline"
								: "default"
						}
						className="min-h-11"
						disabled={direct.isPending}
						onClick={() =>
							DIRECT.includes(action)
								? direct.mutate({
										shipmentId: shipment.id,
										action: action as "start" | "ready_for_pickup",
									})
								: setDialog(action)
						}
					>
						{t(`action.${action}`)}
					</Button>
				))}
			</div>
			{direct.isError && (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(direct.error, tRoot)}
				</p>
			)}
			{dialog === "handover" && <ShipmentHandoverDialog {...common} />}
			{dialog === "declare_delivered" && <ShipmentDeclareDialog {...common} />}
			{dialog === "report_attempt" && (
				<ShipmentReasonDialog {...common} mode="attempt" />
			)}
			{dialog === "mark_returned" && finalFailure && (
				<ShipmentReturnConfirm {...common} />
			)}
			{dialog === "mark_returned" && !finalFailure && (
				<ShipmentReasonDialog {...common} mode="return" />
			)}
			{dialog === "assign_rider" && <ShipmentRiderDialog {...common} />}
			{dialog === "switch_carrier" && (
				<ShipmentCarrierDialog
					shopId={shopId}
					orderId={orderId}
					shipment={shipment}
					cod={cod}
					onClose={close}
				/>
			)}
			{dialog === "reschedule" && <ShipmentReschedule {...common} now={now} />}
		</div>
	);
}

/** The failure is already final, so "back at the shop" needs no reason, only a confirmation. */
function ShipmentReturnConfirm({
	shopId,
	orderId,
	shipmentId,
	onClose,
}: {
	shopId: string;
	orderId: string;
	shipmentId: string;
	onClose: () => void;
}) {
	const t = useTranslations("SellerShipments");
	const tRoot = useTranslations();
	const action = useShipmentAction(shopId, orderId);
	return (
		<div
			role="alertdialog"
			aria-label={t("returnTitle")}
			className="space-y-2 rounded-xl border border-[#E2E8F0] p-3 text-sm"
		>
			<p>{t("returnConfirm")}</p>
			{action.isError && (
				<p role="alert" className="text-red-700">
					{resolveErrorMessage(action.error, tRoot)}
				</p>
			)}
			<div className="flex gap-2">
				<Button
					className="min-h-11"
					disabled={action.isPending}
					onClick={() =>
						action.mutate(
							{ shipmentId, action: "mark_returned", body: {} },
							{ onSuccess: onClose },
						)
					}
				>
					{t("confirm")}
				</Button>
				<Button variant="outline" className="min-h-11" onClick={onClose}>
					{t("cancel")}
				</Button>
			</div>
		</div>
	);
}
