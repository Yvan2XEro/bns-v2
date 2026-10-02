"use client";

import { Minus, Plus, RotateCcw, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useReducer } from "react";
import { Button } from "~/components/ui/button";
import { useAppConfig } from "~/hooks/use-app-config";
import { useAddCartItem } from "~/hooks/use-cart";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type DeliveryLineInput,
	deliveryLine,
	signInToAddHref,
} from "~/lib/buy-box";
import {
	type AddToCartRequest,
	type SingleShopConflict,
	singleShopConflict,
} from "~/lib/cart-lines";
import { formatXaf } from "~/lib/order-money";
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
	"flex h-11 w-11 items-center justify-center rounded-lg border border-[#E2E8F0] text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-40";

export function BuyActions({
	listingId,
	shopId,
	variant,
	signedIn,
	delivery,
}: {
	listingId: string;
	shopId: string | null;
	variant: PublicVariantDoc | null;
	signedIn: boolean;
	delivery: DeliveryLineInput;
}) {
	const t = useTranslations("BuyBox");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const router = useRouter();
	const quantityId = useId();
	const { launchCities, withdrawalDays } = useAppConfig();
	const add = useAddCartItem();
	const [state, patch] = useReducer(reducer, initialState);
	const line = deliveryLine(delivery, launchCities);
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
		<div className="space-y-4 border-[#E2E8F0] border-t pt-4">
			<div className="flex items-center gap-3">
				<span id={`${quantityId}-label`} className="text-[#64748B] text-sm">
					{t("quantity")}
				</span>
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
					className="min-w-8 text-center font-semibold text-[#0F172A]"
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

			{!buyable && (
				<p className="text-[#991b1b] text-sm">{t("chooseVariant")}</p>
			)}

			<div className="grid gap-2 sm:grid-cols-2">
				<Button
					type="button"
					variant="outline"
					className="min-h-11"
					disabled={!buyable || add.isPending}
					onClick={() => submit(false)}
				>
					{t("addToCart")}
				</Button>
				<Button
					type="button"
					className="min-h-11 bg-[#1E40AF] hover:bg-[#1E3A8A]"
					disabled={!buyable || add.isPending}
					onClick={() => submit(true)}
				>
					{t("buyNow")}
				</Button>
			</div>

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

			{line && (
				<p className="flex items-center gap-2 text-[#334155] text-sm">
					<Truck
						aria-hidden="true"
						className="h-4 w-4 shrink-0 text-[#1E40AF]"
					/>
					{[
						line.delivery &&
							t("deliveryTo", {
								city: line.delivery.city,
								fee: formatXaf(line.delivery.fee, locale),
							}),
						line.pickup && t("pickupFree"),
					]
						.filter(Boolean)
						.join(" · ")}
				</p>
			)}

			<div className="flex flex-wrap gap-2">
				<span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-1 font-medium text-[#166534] text-xs">
					<Wallet aria-hidden="true" className="h-3.5 w-3.5" />
					{t("codBadge")}
				</span>
				<span className="inline-flex items-center gap-1 rounded-full bg-[#EFF6FF] px-2.5 py-1 font-medium text-[#1E40AF] text-xs">
					<RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
					{t("returnBadge", { days: withdrawalDays })}
				</span>
			</div>

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
