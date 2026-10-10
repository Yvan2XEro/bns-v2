import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "~/components/ui/button";
import { parseAddToCart } from "~/lib/cart-lines";
import { getAuthUser } from "~/lib/server-api";
import { CartClient } from "./cart-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Cart");
	return { title: t("title") };
}

export default async function CartPage({
	searchParams,
}: {
	searchParams: Promise<{ addToCart?: string | string[] }>;
}) {
	const { addToCart } = await searchParams;
	const pendingAdd = typeof addToCart === "string" ? addToCart : null;

	// `/cart` is not in the middleware's protected list, and an add replayed
	// after sign-in has to survive the round trip, so the page carries its own
	// parameter into `redirect` (which `/auth/login` reads through
	// `safeReturnTo`).
	const user = await getAuthUser();
	if (!user) {
		const back = pendingAdd
			? `/cart?addToCart=${encodeURIComponent(pendingAdd)}`
			: "/cart";
		redirect(`/auth/login?redirect=${encodeURIComponent(back)}`);
	}

	const t = await getTranslations("Cart");

	return (
		<div className="container mx-auto max-w-3xl px-4 py-8 sm:px-6">
			<h1 className="mb-6 font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
			<CartClient
				addToCart={parseAddToCart(pendingAdd)}
				emptyState={
					<div className="rounded-2xl border-2 border-[#DBEAFE] border-dashed py-16 text-center">
						<ShoppingCart
							className="mx-auto mb-3 h-10 w-10 text-[#94A3B8]"
							aria-hidden
						/>
						<p className="font-semibold text-[#0F172A]">{t("empty")}</p>
						<Button asChild className="mt-4 min-h-11">
							<Link href="/search">{t("emptyCta")}</Link>
						</Button>
					</div>
				}
				skeleton={
					<div className="space-y-3">
						{[0, 1, 2].map((row) => (
							<div
								key={row}
								className="h-28 animate-pulse rounded-2xl bg-[#F1F5F9]"
							/>
						))}
					</div>
				}
			/>
		</div>
	);
}
