"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useReducer } from "react";
import { Button } from "~/components/ui/button";
import { useAppConfig } from "~/hooks/use-app-config";
import { useCart } from "~/hooks/use-cart";
import { useCheckoutQuote, usePlaceOrder } from "~/hooks/use-checkout";
import { ERROR_CODES } from "~/lib/apiError";
import {
	addressFieldOf,
	type CheckoutStep,
	checkoutReducer,
	initialCheckoutState,
	placeOrderBody,
} from "~/lib/checkout-form";
import type {
	AddressInput,
	DeliveryOption,
	QuoteResponse,
} from "~/types/order";
import { AddressStep } from "./address-step";
import { DeliveryStep } from "./delivery-step";
import { ReviewStep } from "./review-step";

const STEPS: Array<{
	step: CheckoutStep;
	label: "stepAddress" | "stepDelivery" | "stepReview";
}> = [
	{ step: "address", label: "stepAddress" },
	{ step: "delivery", label: "stepDelivery" },
	{ step: "review", label: "stepReview" },
];

export function CheckoutClient() {
	const t = useTranslations("Checkout");
	const locale = useLocale() === "en" ? "en" : "fr";
	const router = useRouter();
	const { ordersEnabled, launchCities } = useAppConfig();
	const cart = useCart(ordersEnabled);
	const quote = useCheckoutQuote();
	const place = usePlaceOrder();
	const [state, dispatch] = useReducer(checkoutReducer, null, () =>
		initialCheckoutState(crypto.randomUUID()),
	);

	if (!ordersEnabled)
		return <p className="text-[#334155]">{t("ordersClosed")}</p>;
	// Placement empties the cart before the confirmation page has loaded.
	if (cart.isPending || place.isSuccess) {
		return (
			<LoaderCircle className="mx-auto h-6 w-6 animate-spin text-[#64748B]" />
		);
	}
	if (!cart.data || cart.data.lines.length === 0) {
		return (
			<div className="space-y-4 text-center">
				<p className="text-[#334155]">{t("emptyCart")}</p>
				<Button asChild className="min-h-11">
					<Link href="/cart">{t("goToCart")}</Link>
				</Button>
			</div>
		);
	}

	const requestQuote = (
		address: AddressInput,
		option: DeliveryOption,
		onQuote: (fresh: QuoteResponse) => void,
	) =>
		quote.mutate(
			{
				address,
				deliveryOptionId: option.optionId,
				paymentMethod: "cod",
				locale,
			},
			{
				onSuccess: onQuote,
				onError: (error) => {
					if (error.code === ERROR_CODES.checkoutAddressInvalid) {
						dispatch({ type: "addressRejected", field: addressFieldOf(error) });
					}
				},
			},
		);

	const chooseOption = (option: DeliveryOption) => {
		if (!state.address) return;
		dispatch({ type: "optionChosen", option });
		// An address accepted under pickup rules may lack the landmark delivery needs.
		if (option.method === "seller_delivery" && !state.address.landmark) {
			dispatch({ type: "addressRejected", field: "landmark" });
			return;
		}
		requestQuote(state.address, option, (fresh) =>
			dispatch({ type: "quoteLoaded", quote: fresh }),
		);
	};

	// `checkout.quoteChanged` is answered with a new quote, never a retry: the
	// buyer must see, and tick for, the summary that will actually be placed.
	const placeOrder = () => {
		const body = placeOrderBody(state, locale);
		if (!body) return;
		place.mutate(body, {
			onSuccess: (placed) =>
				router.push(
					`/checkout/confirmation/${encodeURIComponent(placed.orderId)}?c=${placed.confirmationRequired}`,
				),
			onError: (error) => {
				if (error.code !== ERROR_CODES.checkoutQuoteChanged) return;
				if (!state.address || !state.option) return;
				requestQuote(state.address, state.option, (fresh) =>
					dispatch({ type: "quoteChanged", quote: fresh }),
				);
			},
		});
	};

	const current = STEPS.findIndex((s) => s.step === state.step) + 1;

	return (
		<div className="space-y-6">
			<header className="space-y-2">
				<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
				<p className="text-[#64748B] text-sm">{t("stepOf", { current })}</p>
				<ol className="flex gap-2 text-sm">
					{STEPS.map(({ step, label }, i) => (
						<li
							key={step}
							aria-current={step === state.step ? "step" : undefined}
							className={
								i + 1 <= current
									? "font-semibold text-[#1E40AF]"
									: "text-[#94A3B8]"
							}
						>
							{t(label)}
						</li>
					))}
				</ol>
			</header>

			{state.step === "address" && (
				<AddressStep
					initial={state.address}
					launchCities={launchCities}
					shopCity={cart.data.shop?.city ?? null}
					method={state.option?.method ?? "seller_delivery"}
					rejectedField={state.addressError}
					rejection={
						quote.error?.code === ERROR_CODES.checkoutAddressInvalid
							? quote.error
							: null
					}
					onSubmit={(address) =>
						dispatch({ type: "addressSubmitted", address })
					}
				/>
			)}
			{state.step === "delivery" && state.address && (
				<DeliveryStep
					address={state.address}
					selected={state.option}
					onChoose={chooseOption}
					onBack={() => dispatch({ type: "goTo", step: "address" })}
				/>
			)}
			{state.step === "review" && (
				<ReviewStep
					state={state}
					dispatch={dispatch}
					quoting={quote.isPending}
					quoteError={quote.error}
					onRetryQuote={() => state.option && chooseOption(state.option)}
					placing={place.isPending}
					placeError={
						place.error?.code === ERROR_CODES.checkoutQuoteChanged
							? null
							: place.error
					}
					onPlace={placeOrder}
				/>
			)}
		</div>
	);
}
