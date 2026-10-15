"use client";

import { ImageOff, Store } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useOrderMoney } from "~/hooks/use-order-money";
import type { CartView } from "~/types/order";

/**
 * The cart beside the address and delivery steps, as the design keeps the
 * order in view the whole way; the review step shows the full quote instead.
 */
export function CartAside({ cart }: { cart: CartView }) {
	const t = useTranslations("Checkout");
	const formatOrderMoney = useOrderMoney();
	const locale = useLocale() === "en" ? "en" : "fr";

	return (
		<aside className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-white p-5 lg:sticky lg:top-6">
			<h2 className="font-bold text-[#0F172A] text-lg">{t("summary")}</h2>
			{cart.shop && (
				<p className="flex items-center gap-2 text-[#334155] text-sm">
					<Store aria-hidden="true" className="h-4 w-4 text-[#1E40AF]" />
					<span className="font-semibold">{cart.shop.name}</span>
				</p>
			)}
			<ul className="space-y-3">
				{cart.lines.map((line) => (
					<li key={line.id} className="flex items-center gap-3">
						<div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#EFF6FF]">
							{line.imageUrl ? (
								<Image
									src={line.imageUrl}
									alt=""
									fill
									sizes="48px"
									className="object-cover"
								/>
							) : (
								<ImageOff
									aria-hidden="true"
									className="h-4 w-4 text-[#94A3B8]"
								/>
							)}
						</div>
						<div className="min-w-0 flex-1 text-sm">
							<p className="truncate font-semibold text-[#0F172A]">
								{line.title}
							</p>
							<p className="text-[#64748B] text-xs">
								{[line.variantLabel, t("quantity", { quantity: line.quantity })]
									.filter(Boolean)
									.join(" · ")}
							</p>
						</div>
						<p className="font-semibold text-[#0F172A] text-sm">
							{formatOrderMoney(line.lineSubtotal, locale)}
						</p>
					</li>
				))}
			</ul>
			<div className="flex items-center justify-between border-[#E2E8F0] border-t pt-3 text-sm">
				<span className="text-[#334155]">{t("subtotal")}</span>
				<span className="font-bold text-[#0F172A]">
					{formatOrderMoney(cart.subtotal, locale)}
				</span>
			</div>
			<p className="text-[#64748B] text-xs">{t("asideDeliveryNext")}</p>
		</aside>
	);
}
