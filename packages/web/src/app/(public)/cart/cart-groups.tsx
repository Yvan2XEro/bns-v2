"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { LevelBadge } from "~/components/shop/level-badge";
import { Button } from "~/components/ui/button";
import { useOrderMoney } from "~/hooks/use-order-money";
import type { CartLineView, SplitCartView } from "~/types/order";
import { CartLine } from "./cart-line";

const hasAvailable = (items: readonly CartLineView[]) =>
	items.some((line) => line.available);

/** One section per (storefront, fulfilling) group; every figure is the server's. */
export function CartGroups({
	cart,
	locale,
	busy,
	onQuantity,
	onRemoveLine,
	onRemoveGroup,
}: {
	cart: SplitCartView;
	locale: "fr" | "en";
	busy: boolean;
	onQuantity: (lineId: string, quantity: number) => void;
	onRemoveLine: (lineId: string) => void;
	onRemoveGroup: (lineIds: string[]) => void;
}) {
	const formatOrderMoney = useOrderMoney();
	const tRoot = useTranslations();
	const ready = cart.groups.some((group) => hasAvailable(group.items));

	return (
		<div className="space-y-5">
			{cart.groups.map((group) => {
				const blocked = group.items.some((line) => !line.available);
				return (
					<section key={group.groupKey} className="space-y-3">
						<div className="flex items-center justify-between gap-3">
							<h2 className="font-semibold text-[#0F172A]">
								<Link
									href={`/s/${group.fulfillingShop.handle}`}
									className="hover:text-[#1E40AF] hover:underline"
								>
									{tRoot("CheckoutGroup.cartGroupHeading", {
										shop: group.fulfillingShop.name,
									})}
								</Link>
								<LevelBadge
									badge={group.fulfillingShop.badge}
									size="sm"
									className="ml-2 align-middle"
								/>
							</h2>
							<Button
								type="button"
								variant="ghost"
								className="min-h-11 text-red-600"
								disabled={busy}
								onClick={() =>
									onRemoveGroup(group.items.map((line) => line.id))
								}
							>
								{tRoot("CheckoutGroup.groupRemove")}
							</Button>
						</div>
						<ul className="space-y-3">
							{group.items.map((line) => (
								<CartLine
									key={line.id}
									line={line}
									locale={locale}
									busy={busy}
									onQuantity={(quantity) => onQuantity(line.id, quantity)}
									onRemove={() => onRemoveLine(line.id)}
								/>
							))}
						</ul>
						{blocked ? (
							<p className="text-red-600 text-sm">
								{tRoot("CheckoutGroup.unavailable_other")}
							</p>
						) : null}
						<dl className="space-y-1 rounded-xl bg-[#F8FAFC] px-4 py-3 text-sm">
							<div className="flex justify-between">
								<dt className="text-[#64748B]">
									{tRoot("CheckoutGroup.groupSubtotal")}
								</dt>
								<dd className="font-semibold text-[#0F172A]">
									{formatOrderMoney(group.subtotal, locale)}
								</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-[#64748B]">
									{tRoot("CheckoutGroup.groupDelivery")}
								</dt>
								<dd className="text-[#64748B]">
									{tRoot("CheckoutGroup.deliveryAtCheckout")}
								</dd>
							</div>
						</dl>
					</section>
				);
			})}
			<section className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
				<div className="flex items-center justify-between">
					<span className="text-[#64748B]">{tRoot("Cart.subtotal")}</span>
					<span className="font-bold text-[#0F172A] text-xl">
						{formatOrderMoney(cart.grandSubtotal, locale)}
					</span>
				</div>
				{ready ? (
					<Button asChild size="lg" className="min-h-11 w-full">
						<Link href="/checkout">{tRoot("Cart.checkout")}</Link>
					</Button>
				) : (
					<Button size="lg" className="min-h-11 w-full" disabled>
						{tRoot("Cart.checkout")}
					</Button>
				)}
			</section>
		</div>
	);
}
