import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type {
	BuyerCancelReason,
	DeliveryFailureReason,
	HandoverCodeResponse,
	OrderView,
	SellerEndReason,
	WithdrawalInput,
	WithdrawalResponse,
} from "../types/order";
import { purchasesRootKey } from "./usePurchases";
import { shopOrdersRootKey } from "./useSellerOrders";

/**
 * Every write an order accepts, one hook each, all over
 * `POST /api/orders/{id}/<segment>`. Which of them a screen may offer is
 * `availableActions` in `src/lib/orderActions.ts`; this file only knows how to
 * send them and what to drop afterwards.
 *
 * `shopId` is optional because a buyer's screens do not have one. When it is
 * given, the shop's order scope is dropped too — the row the seller is looking
 * at, its tab counts and the order's own detail all change on any of these.
 */
function useInvalidateOrder(shopId?: string) {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: purchasesRootKey });
		if (shopId) {
			queryClient.invalidateQueries({ queryKey: shopOrdersRootKey(shopId) });
		}
	};
}

/** Shared wiring: one POST, one invalidation set, one typed body. */
function useOrderPost<TBody, TResult = OrderView>(
	orderId: string | undefined,
	segment: string,
	shopId?: string,
) {
	const invalidate = useInvalidateOrder(shopId);
	return useMutation({
		mutationFn: (body: TBody) =>
			api.post<TResult>(`/api/orders/${orderId}/${segment}`, body ?? {}),
		onSuccess: invalidate,
	});
}

// --- The buyer's own routes ------------------------------------------------
// A shop member calling one of these gets `order.notFound`, the same answer a
// stranger gets (`requireBuyer` / `requireOrderBuyer`).

export function useConfirmOrderCode(orderId: string | undefined) {
	return useOrderPost<{ code: string }>(orderId, "confirm");
}

export function useResendConfirmationCode(orderId: string | undefined) {
	return useOrderPost<void, { expiresAt: string }>(
		orderId,
		"confirmation-code/resend",
	);
}

export function useCancelOrder(orderId: string | undefined) {
	return useOrderPost<{ reason?: BuyerCancelReason }>(orderId, "cancel");
}

export function useConfirmReceipt(orderId: string | undefined) {
	return useOrderPost<void>(orderId, "confirm-receipt");
}

export function useContestDelivery(orderId: string | undefined) {
	return useOrderPost<{ note?: string }>(orderId, "contest-delivery");
}

/**
 * The buyer's fallback once the handover code they were sent no longer works.
 * The only code route that answers with the plaintext code, because this one
 * is read out loud to a courier at the door rather than sent by SMS.
 */
export function useRegenerateHandoverCode(orderId: string | undefined) {
	return useOrderPost<void, HandoverCodeResponse>(
		orderId,
		"handover-code/regenerate",
	);
}

/** Opens the return case; answers with its number, not with the order. */
export function useRequestWithdrawal(orderId: string | undefined) {
	return useOrderPost<WithdrawalInput, WithdrawalResponse>(
		orderId,
		"withdrawal",
	);
}

// --- The shop's routes ----------------------------------------------------
// All gated on `orders.process` except `seller-cancel`, which needs
// `orders.cancel` — owner or manager, never staff.

export function useAcceptOrder(orderId: string | undefined, shopId?: string) {
	return useOrderPost<void>(orderId, "accept", shopId);
}

export function useDeclineOrder(orderId: string | undefined, shopId?: string) {
	return useOrderPost<{ reason: SellerEndReason; note?: string }>(
		orderId,
		"decline",
		shopId,
	);
}

/**
 * Confirms *and* accepts in one call: the seller reached the buyer by phone,
 * so `confirmBySellerCall` writes both transitions in one transaction.
 */
export function useConfirmByCall(orderId: string | undefined, shopId?: string) {
	return useOrderPost<void>(orderId, "confirm-by-call", shopId);
}

export function useShipOrder(orderId: string | undefined, shopId?: string) {
	return useOrderPost<void>(orderId, "ship", shopId);
}

export function useSellerCancelOrder(
	orderId: string | undefined,
	shopId?: string,
) {
	return useOrderPost<{ reason: SellerEndReason; note?: string }>(
		orderId,
		"seller-cancel",
		shopId,
	);
}

/**
 * The four-digit code keyed in at the door. A wrong or exhausted code answers
 * 400/409 with `HandoverFailureData` in the body — `handover.locked` and
 * `attemptsLeft` — which is the only place a client ever learns the lock
 * state, because no order projection carries `order.handover`.
 */
export function useVerifyHandoverCode(
	orderId: string | undefined,
	shopId?: string,
) {
	return useOrderPost<{ code: string }>(orderId, "handover", shopId);
}

export function useDeclareDelivered(
	orderId: string | undefined,
	shopId?: string,
) {
	return useOrderPost<{ note?: string; photo?: string }>(
		orderId,
		"declare-delivered",
		shopId,
	);
}

/** The first failed attempt only; the order stays `shipped`. */
export function useReportFailedAttempt(
	orderId: string | undefined,
	shopId?: string,
) {
	return useOrderPost<{ reason: DeliveryFailureReason; note?: string }>(
		orderId,
		"delivery-attempt-failed",
		shopId,
	);
}

export function useMarkDeliveryFailed(
	orderId: string | undefined,
	shopId?: string,
) {
	return useOrderPost<{ reason: DeliveryFailureReason; note?: string }>(
		orderId,
		"mark-delivery-failed",
		shopId,
	);
}
