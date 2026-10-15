"use client";
import { useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { useOrderMoney } from "~/hooks/use-order-money";
import { useDeliveryCities, usePickupPoints } from "~/hooks/use-pickup-points";

/** The shop's base fee per city it delivers to, then each pickup point and its fee. */
export function DeliveryCities({
	shopId,
	handle,
}: {
	shopId: string;
	handle: string;
}) {
	const t = useTranslations("ShopPage");
	const formatOrderMoney = useOrderMoney();
	const cities = useDeliveryCities(shopId);
	const pickup = usePickupPoints(handle);
	const { ordersEnabled, deliveryZonesEnabled, launchCities } = useAppConfig();
	if (!ordersEnabled || !deliveryZonesEnabled) return null;

	const cityLabel = (key: string) =>
		launchCities.find((city) => city.key === key)?.label ?? key;
	const money = (fee: number) =>
		fee === 0 ? t("free") : formatOrderMoney(fee);
	const fees = new Map(
		(cities.data?.deliveryFees ?? []).map((row) => [row.city, row]),
	);
	const deliveryRows = (cities.data?.deliveryCities ?? []).map((city) => {
		const row = fees.get(city);
		return {
			key: `city-${city}`,
			label: cityLabel(city),
			fee: !row
				? null
				: row.minFee === row.maxFee
					? money(row.minFee)
					: t("feeFrom", { fee: formatOrderMoney(row.minFee) }),
			free: row?.maxFee === 0,
		};
	});
	const pickupRows = (pickup.data ?? []).map((point) => ({
		key: `pickup-${point.id}`,
		label: t("pickupAt", { name: point.name }),
		fee: money(point.pickupFee),
		free: point.pickupFee === 0,
	}));
	const rows = [...deliveryRows, ...pickupRows];
	if (rows.length === 0) return null;

	return (
		<section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
			<h2 className="mb-2.5 font-bold text-[#0F172A] text-[15px]">
				{t("deliveryTitle")}
			</h2>
			<ul>
				{rows.map((row) => (
					<li
						key={row.key}
						className="flex justify-between gap-3 py-1.5 text-[#334155] text-sm"
					>
						<span className="min-w-0 break-words">{row.label}</span>
						{row.fee && (
							<span
								className={`shrink-0 font-semibold ${row.free ? "text-[#15803D]" : "text-[#0F172A]"}`}
							>
								{row.fee}
							</span>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
