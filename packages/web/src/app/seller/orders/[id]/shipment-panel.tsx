"use client";

import { useTranslations } from "next-intl";
import { useNow } from "~/app/purchases/use-now";
import { useOrderShipments } from "~/hooks/use-shop-shipments";
import { resolveErrorMessage } from "~/lib/apiError";
import type { ShopRole } from "~/types";
import type { OrderView } from "~/types/order";
import { ShipmentCard } from "./shipment-card";

/** One card per shipment of the order, as the route serves them to the shop. */
export function ShipmentPanel({
	order,
	shopId,
	role,
}: {
	order: OrderView;
	shopId: string;
	role: ShopRole | null;
}) {
	const t = useTranslations("SellerShipments");
	const tRoot = useTranslations();
	const now = useNow();
	const shipments = useOrderShipments(shopId, order.id, order.status);

	if (shipments.isError) {
		return (
			<p role="alert" className="text-red-700 text-sm">
				{resolveErrorMessage(shipments.error, tRoot, t("loadError"))}
			</p>
		);
	}
	if (!shipments.data || shipments.data.length === 0) return null;
	return (
		<section aria-labelledby="shipment-panel-title" className="space-y-3">
			<h2 id="shipment-panel-title" className="font-semibold text-[#0F172A]">
				{t("title")}
			</h2>
			{shipments.data.map((shipment) => (
				<ShipmentCard
					key={shipment.id}
					shopId={shopId}
					orderId={order.id}
					shipment={shipment}
					role={role}
					cod={order.paymentMethod === "cod"}
					now={now}
				/>
			))}
		</section>
	);
}
