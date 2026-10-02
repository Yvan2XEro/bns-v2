"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { useCart } from "~/hooks/use-cart";
import { cartTotals } from "~/lib/cart-lines";

/** The header's cart entry; absent, not broken, while ordering is off. */
export function CartButton({ className }: { className?: string }) {
	const t = useTranslations("Header");
	const { ordersEnabled } = useAppConfig();
	const cart = useCart(ordersEnabled);
	if (!ordersEnabled) return null;

	const count = cart.data ? cartTotals(cart.data.lines).itemCount : 0;

	return (
		<Link
			href="/cart"
			aria-label={t("cartWithCount", { count })}
			className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] transition-all duration-200 hover:scale-110 hover:bg-[#F1F5F9] hover:text-[#0F172A] active:scale-95 ${className ?? ""}`}
		>
			<ShoppingCart aria-hidden="true" className="h-5 w-5" />
			{count > 0 && (
				<span className="-top-0.5 -right-0.5 absolute flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F59E0B] px-1 font-bold text-[#0F172A] text-[10px]">
					{count > 99 ? "99+" : count}
				</span>
			)}
		</Link>
	);
}
