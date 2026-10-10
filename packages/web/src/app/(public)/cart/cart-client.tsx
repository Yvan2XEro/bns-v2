"use client";

import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useReducer, useRef } from "react";
import { Button } from "~/components/ui/button";
import { useAppConfig } from "~/hooks/use-app-config";
import {
	useAddCartItem,
	useCart,
	useRemoveCartItem,
	useSetCartItemQuantity,
} from "~/hooks/use-cart";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type AddToCartRequest,
	canCheckout,
	cartTotals,
	type SingleShopConflict,
	singleShopConflict,
} from "~/lib/cart-lines";
import { formatXaf } from "~/lib/order-money";
import type { CartView } from "~/types/order";
import { CartLine } from "./cart-line";
import { SingleShopDialog } from "./single-shop-dialog";

type State = {
	/** The refused add, kept so "replace" can re-send it. */
	conflict: (SingleShopConflict & { request: AddToCartRequest }) | null;
	actionError: string | null;
};

const initialState: State = { conflict: null, actionError: null };

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

/**
 * The empty state and the skeleton are static, so the page renders them on
 * the server and hands them in as slots.
 */
export function CartClient({
	addToCart,
	emptyState,
	skeleton,
}: {
	addToCart: AddToCartRequest | null;
	emptyState: ReactNode;
	skeleton: ReactNode;
}) {
	const t = useTranslations("Cart");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const router = useRouter();
	const { ordersEnabled } = useAppConfig();
	const cart = useCart(ordersEnabled);
	const add = useAddCartItem();
	const setQuantity = useSetCartItemQuantity();
	const remove = useRemoveCartItem();
	const [state, patch] = useReducer(reducer, initialState);

	// Replays the add a signed-out visitor started before signing in, once:
	// the parameter is dropped from the URL straight away so a refresh does
	// not add the item a second time.
	const { mutate: replayAdd } = add;
	const replayed = useRef(false);
	useEffect(() => {
		if (!addToCart || replayed.current) return;
		replayed.current = true;
		router.replace("/cart");
		replayAdd(addToCart, {
			onError: (error) => {
				const conflict = singleShopConflict(error, null);
				if (conflict) patch({ conflict: { ...conflict, request: addToCart } });
				else patch({ actionError: resolveErrorMessage(error, tRoot) });
			},
		});
	}, [addToCart, replayAdd, router, tRoot]);

	if (!ordersEnabled) notFound();

	async function run(action: () => Promise<unknown>) {
		patch({ actionError: null });
		try {
			await action();
		} catch (error) {
			patch({ actionError: resolveErrorMessage(error, tRoot) });
		}
	}

	const replaceCart = () =>
		run(async () => {
			if (!state.conflict) return;
			await add.mutateAsync({ ...state.conflict.request, replace: true });
			patch({ conflict: null });
		});

	if (cart.isPending) return skeleton;

	if (cart.isError) {
		return (
			<div
				role="alert"
				className="rounded-2xl border border-[#E2E8F0] bg-white px-6 py-12 text-center"
			>
				<p className="font-semibold text-[#0F172A]">
					{resolveErrorMessage(cart.error, tRoot)}
				</p>
				<Button className="mt-4 min-h-11" onClick={() => void cart.refetch()}>
					{t("retry")}
				</Button>
			</div>
		);
	}

	const view = cart.data;
	const busy = setQuantity.isPending || remove.isPending || add.isPending;

	return (
		<div className="space-y-5">
			{add.isPending && !state.conflict ? (
				<output className="block text-[#64748B] text-sm">{t("adding")}</output>
			) : null}
			{state.actionError ? (
				<p
					role="alert"
					className="rounded-xl bg-red-50 px-4 py-3 text-red-700 text-sm"
				>
					{state.actionError}
				</p>
			) : null}

			{view.lines.length === 0 ? (
				emptyState
			) : (
				<>
					<section className="space-y-3">
						{view.shop ? (
							<h2 className="font-semibold text-[#0F172A]">
								<Link
									href={`/s/${view.shop.handle}`}
									className="hover:text-[#1E40AF] hover:underline"
								>
									{t("shopHeader", { shop: view.shop.name })}
								</Link>
							</h2>
						) : null}
						<ul className="space-y-3">
							{view.lines.map((line) => (
								<CartLine
									key={line.id}
									line={line}
									locale={locale}
									busy={busy}
									onQuantity={(quantity) =>
										run(() =>
											setQuantity.mutateAsync({ lineId: line.id, quantity }),
										)
									}
									onRemove={() => run(() => remove.mutateAsync(line.id))}
								/>
							))}
						</ul>
					</section>
					<CartSummary cart={view} locale={locale} />
				</>
			)}

			<SingleShopDialog
				conflict={state.conflict}
				replacing={add.isPending}
				onReplace={() => void replaceCart()}
				onKeep={() => patch({ conflict: null })}
			/>
		</div>
	);
}

function CartSummary({
	cart,
	locale,
}: {
	cart: CartView;
	locale: "fr" | "en";
}) {
	const t = useTranslations("Cart");
	const totals = cartTotals(cart.lines);
	const ready = canCheckout(cart);

	return (
		<section className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
			<div className="flex items-center justify-between">
				<span className="text-[#64748B]">
					{t("subtotal")} · {t("itemCount", { count: totals.itemCount })}
				</span>
				<span className="font-bold text-[#0F172A] text-xl">
					{formatXaf(totals.subtotal, locale)}
				</span>
			</div>
			{totals.priceChangedCount > 0 ? (
				<p className="text-amber-700 text-sm">
					{t("priceChangedNotice", { count: totals.priceChangedCount })}
				</p>
			) : null}
			{totals.unavailableCount > 0 ? (
				<p className="text-red-600 text-sm">{t("unavailableBlocking")}</p>
			) : null}
			{cart.shopOrderable ? null : (
				<p className="text-red-600 text-sm">{t("shopNotOrderable")}</p>
			)}
			{ready ? (
				<Button asChild size="lg" className="min-h-11 w-full">
					<Link href="/checkout">{t("checkout")}</Link>
				</Button>
			) : (
				<Button size="lg" className="min-h-11 w-full" disabled>
					{t("checkout")}
				</Button>
			)}
		</section>
	);
}
