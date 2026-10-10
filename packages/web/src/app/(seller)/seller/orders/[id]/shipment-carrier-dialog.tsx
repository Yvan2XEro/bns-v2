"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useAppConfig } from "~/hooks/use-app-config";
import { useAvailableCouriers } from "~/hooks/use-delivery-settings";
import { useSwitchCarrier } from "~/hooks/use-shop-shipments";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatXaf } from "~/lib/order-money";
import { eligibleCouriers, shipmentDestination } from "~/lib/shipment-panel";
import type { ShopShipmentView } from "../../../../../../../api/src/contracts/shipments";
import { ActionDialog } from "../../../../(public)/purchases/[id]/action-dialog";
import { useLocaleKey } from "../../billing/use-locale-key";

/** Own delivery, or a partner courier priced from the registry; the route cancels the old carrier and creates the new one together. */
export function ShipmentCarrierDialog({
	shopId,
	orderId,
	shipment,
	cod,
	onClose,
}: {
	shopId: string;
	orderId: string;
	shipment: ShopShipmentView;
	cod: boolean;
	onClose: () => void;
}) {
	const t = useTranslations("SellerShipments");
	const tRoot = useTranslations();
	const locale = useLocaleKey();
	const { couriersEnabled } = useAppConfig();
	const couriers = useAvailableCouriers();
	const switchCarrier = useSwitchCarrier(shopId, orderId);
	const current =
		shipment.carrier === "courier"
			? String(
					typeof shipment.courier === "object"
						? shipment.courier?.id
						: shipment.courier,
				)
			: "self";
	const [choice, setChoice] = useState(current);
	const choices = eligibleCouriers(
		couriers.data ?? [],
		shipmentDestination(shipment),
		cod,
	);

	return (
		<ActionDialog
			open
			onOpenChange={(open) => !open && onClose()}
			title={t("carrierTitle")}
			description={t("carrierBody")}
		>
			<div className="space-y-4">
				<fieldset className="space-y-2">
					<legend className="sr-only">{t("carrierTitle")}</legend>
					<label className="flex min-h-11 items-center gap-3 rounded-xl border border-[#E2E8F0] p-3 text-sm">
						<input
							type="radio"
							name="carrier"
							value="self"
							checked={choice === "self"}
							onChange={() => setChoice("self")}
							className="h-5 w-5 accent-[#1E40AF]"
						/>
						{t("carrierSelf")}
					</label>
					{couriersEnabled &&
						choices.map(({ courier, tariff }) => (
							<label
								key={courier.id}
								className="flex min-h-11 items-start gap-3 rounded-xl border border-[#E2E8F0] p-3 text-sm"
							>
								<input
									type="radio"
									name="carrier"
									value={courier.id}
									checked={choice === courier.id}
									onChange={() => setChoice(courier.id)}
									className="mt-0.5 h-5 w-5 accent-[#1E40AF]"
								/>
								<span>
									<span className="block font-medium">{courier.name}</span>
									<span className="block text-[#64748B] text-xs">
										{tariff
											? t("carrierTariff", {
													amount: formatXaf(tariff.amount, locale),
													min: tariff.etaMinHours,
													max: tariff.etaMaxHours,
												})
											: t("carrierNoTariff")}
									</span>
								</span>
							</label>
						))}
					{couriersEnabled && choices.length === 0 && couriers.isSuccess && (
						<p className="text-[#64748B] text-sm">{t("carrierNone")}</p>
					)}
				</fieldset>
				{switchCarrier.isError && (
					<p role="alert" className="text-red-700 text-sm">
						{resolveErrorMessage(switchCarrier.error, tRoot)}
					</p>
				)}
				<div className="flex justify-end">
					<Button
						className="min-h-11"
						disabled={choice === current || switchCarrier.isPending}
						onClick={() =>
							switchCarrier.mutate(
								{
									shipmentId: shipment.id,
									choice:
										choice === "self"
											? { carrier: "self" }
											: { carrier: "courier", courierId: choice },
								},
								{ onSuccess: onClose },
							)
						}
					>
						{t("carrierConfirm")}
					</Button>
				</div>
			</div>
		</ActionDialog>
	);
}
