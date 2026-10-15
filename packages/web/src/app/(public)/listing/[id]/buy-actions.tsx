"use client";

import { Minus, Plus, ShoppingBag, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useReducer } from "react";
import { Button } from "~/components/ui/button";
import { useAddCartItem } from "~/hooks/use-cart";
import { resolveErrorMessage } from "~/lib/apiError";
import { signInToAddHref } from "~/lib/buy-box";
import {
	type AddToCartRequest,
	type SingleShopConflict,
	singleShopConflict,
} from "~/lib/cart-lines";
import { isVariantInStock } from "~/lib/variants";
import type { PublicVariantDoc } from "~/types";
import { SingleShopDialog } from "../../cart/single-shop-dialog";

type Conflict = SingleShopConflict & {
	request: AddToCartRequest;
	checkout: boolean;
};

type State = {
	quantity: number;
	added: boolean;
	error: string | null;
	conflict: Conflict | null;
};

const initialState: State = {
	quantity: 1,
	added: false,
	error: null,
	conflict: null,
};

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

const stepButton =
	"flex h-full w-8 items-center justify-center text-[#334155] disabled:text-[#94A3B8]";

export function BuyActions({
	listingId,
	shopId,
	variant,
	signedIn,
}: {
	listingId: string;
	shopId: string | null;
	variant: PublicVariantDoc | null;
	signedIn: boolean;
}) {
	const t = useTranslations("BuyBox");
	const tRoot = useTranslations();
	const router = useRouter();
	const quantityId = useId();
	const add = useAddCartItem();
	const [state, patch] = useReducer(reducer, initialState);
	const buyable = variant !== null && isVariantInStock(variant);

	function send(
		request: AddToCartRequest & { replace?: boolean },
		checkout: boolean,
	) {
		patch({ error: null, added: false });
		add.mutate(request, {
			onSuccess: () => {
				patch({ conflict: null });
				if (checkout) router.push("/checkout");
				else patch({ added: true });
			},
			onError: (error) => {
				// The listing's shop id is known here, unlike an add replayed
				// from the cart URL, so the dialog can name the shop in the way.
				const conflict = singleShopConflict(error, shopId);
				if (conflict) patch({ conflict: { ...conflict, request, checkout } });
				else
					patch({ conflict: null, error: resolveErrorMessage(error, tRoot) });
			},
		});
	}

	function submit(checkout: boolean) {
		if (!variant || !buyable) return;
		const request = {
			listingId,
			variantId: variant.id,
			quantity: state.quantity,
		};
		if (!signedIn) {
			router.push(signInToAddHref(request));
			return;
		}
		send(request, checkout);
	}

	return (
		<div className="space-y-3">
			<span id={`${quantityId}-label`} className="sr-only">
				{t("quantity")}
			</span>
			<div className="flex gap-2.5">
				<div className="flex h-12 w-28 shrink-0 items-center justify-between rounded-lg border border-[#E2E8F0] px-1 font-semibold text-[#0F172A]">
					<button
						type="button"
						className={stepButton}
						aria-label={t("decrease")}
						aria-controls={quantityId}
						disabled={state.quantity <= 1}
						onClick={() => patch({ quantity: state.quantity - 1 })}
					>
						<Minus aria-hidden="true" className="h-4 w-4" />
					</button>
					<output
						id={quantityId}
						aria-labelledby={`${quantityId}-label`}
						aria-live="polite"
						className="min-w-6 text-center"
					>
						{state.quantity}
					</output>
					<button
						type="button"
						className={stepButton}
						aria-label={t("increase")}
						aria-controls={quantityId}
						onClick={() => patch({ quantity: state.quantity + 1 })}
					>
						<Plus aria-hidden="true" className="h-4 w-4" />
					</button>
				</div>
				{/* "Commander" goes straight to checkout with this item; the cart
				    stays reachable through the quieter add below. */}
				<Button
					type="button"
					className="h-12 flex-1 gap-2 bg-[#1E40AF] font-bold text-[15px] hover:bg-[#1E3A8A]"
					disabled={!buyable || add.isPending}
					onClick={() => submit(true)}
				>
					<ShoppingBag aria-hidden="true" className="h-[18px] w-[18px]" />
					{t("order")}
				</Button>
			</div>

			{!buyable && (
				<p className="text-[#991b1b] text-sm">{t("chooseVariant")}</p>
			)}

			<button
				type="button"
				className="flex w-full items-center justify-center gap-1.5 font-medium text-[#1E40AF] text-sm hover:underline disabled:opacity-50 disabled:hover:no-underline"
				disabled={!buyable || add.isPending}
				onClick={() => submit(false)}
			>
				<ShoppingCart aria-hidden="true" className="h-4 w-4" />
				{t("addToCart")}
			</button>

			{state.added && (
				<output className="block text-[#166534] text-sm">
					{t("added")}{" "}
					<Link href="/cart" className="font-medium text-[#1E40AF] underline">
						{t("viewCart")}
					</Link>
				</output>
			)}
			{state.error && (
				<p
					role="alert"
					className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
				>
					{state.error}
				</p>
			)}

			<SingleShopDialog
				conflict={state.conflict}
				replacing={add.isPending}
				onReplace={() => {
					if (state.conflict) {
						send(
							{ ...state.conflict.request, replace: true },
							state.conflict.checkout,
						);
					}
				}}
				onKeep={() => patch({ conflict: null })}
			/>
		</div>
	);
}
