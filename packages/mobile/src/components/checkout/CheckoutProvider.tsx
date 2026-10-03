import {
	createContext,
	type Dispatch,
	type ReactNode,
	useContext,
	useReducer,
} from "react";
import { useCheckoutQuote, usePlaceOrder } from "@/src/hooks/useCheckout";
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES } from "@/src/lib/apiError";
import {
	type CheckoutAction,
	type CheckoutState,
	checkoutReducer,
	codFallbackOnQuoteError,
	initialCheckoutState,
	newIdempotencyKey,
} from "@/src/lib/checkoutFlow";
import { addressFieldOf } from "@/src/lib/checkoutForm";
import { useTranslation } from "@/src/lib/i18n";
import type {
	AddressInput,
	DeliveryOption,
	PaymentMethod,
	QuoteResponse,
} from "@/src/types/order";

interface CheckoutContextValue {
	state: CheckoutState;
	dispatch: Dispatch<CheckoutAction>;
	quote: ReturnType<typeof useCheckoutQuote>;
	place: ReturnType<typeof usePlaceOrder>;
	requestQuote: (
		address: AddressInput,
		option: DeliveryOption,
		method: PaymentMethod,
		onQuote: (fresh: QuoteResponse) => void,
		onAddressRejected?: () => void,
	) => void;
}

const CheckoutContext = createContext<CheckoutContextValue | null>(null);

export function useAppLocale(): "fr" | "en" {
	const { i18n } = useTranslation();
	return i18n.language?.startsWith("en") ? "en" : "fr";
}

/**
 * The three steps are three routes, so their one reducer and the two
 * mutations they share live here, mounted by `app/checkout/_layout.tsx`: the
 * review step reads the quote the delivery step asked for.
 */
export function CheckoutProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(checkoutReducer, null, () =>
		initialCheckoutState(newIdempotencyKey()),
	);
	const quote = useCheckoutQuote();
	const place = usePlaceOrder();
	const locale = useAppLocale();

	const requestQuote: CheckoutContextValue["requestQuote"] = (
		address,
		option,
		method,
		onQuote,
		onAddressRejected,
	) =>
		quote.mutate(
			{
				address,
				deliveryOptionId: option.optionId,
				paymentMethod: method,
				locale,
			},
			{
				onSuccess: onQuote,
				onError: (error) => {
					if (
						error instanceof ApiError &&
						error.code === ERROR_CODES.checkoutAddressInvalid
					) {
						dispatch({ type: "addressRejected", field: addressFieldOf(error) });
						onAddressRejected?.();
						return;
					}
					// The designed fallback: a refused mobile_money quote switches
					// back to COD and re-asks immediately, rather than stranding the
					// buyer on a method the server will never price.
					const code = error instanceof ApiError ? error.code : null;
					if (codFallbackOnQuoteError(method, code)) {
						dispatch({ type: "paymentMethodChosen", method: "cod" });
						requestQuote(address, option, "cod", onQuote, onAddressRejected);
					}
				},
			},
		);

	return (
		<CheckoutContext.Provider
			value={{ state, dispatch, quote, place, requestQuote }}
		>
			{children}
		</CheckoutContext.Provider>
	);
}

export function useCheckoutFlow(): CheckoutContextValue {
	const value = useContext(CheckoutContext);
	if (!value) throw new Error("useCheckoutFlow outside CheckoutProvider");
	return value;
}
