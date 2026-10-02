"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { type OrderAction, orderActionPath } from "~/lib/order-actions";
import { purchasesRootKey, shopOrdersRootKey } from "~/lib/query-keys";
import { apiPost } from "~/lib/shop-api";
import type { OrderView } from "~/types/order";

export type { OrderAction, OrderActionSubject } from "~/lib/order-actions";
export { availableActions, orderActionPath } from "~/lib/order-actions";

/**
 * Which order a mutation acts on, and — for the seller's screens — which
 * shop's queue it should drop. `shopId` is optional because the buyer's
 * actions genuinely do not know one: `POST /api/orders/{id}/cancel` takes no
 * shop, and a buyer may hold orders from several.
 */
export interface OrderActionTarget {
	orderId: string;
	shopId?: string | null;
}

/**
 * Every reason below is typed `string` on purpose. The vocabulary belongs to
 * the API (`SELLER_END_REASONS` and `BUYER_CANCEL_REASONS` in
 * `services/orders/acceptance.ts`, `ORDER_DELIVERY_FAILURE_REASONS` in
 * `collections/Orders.ts`), which answers `order.reasonRequired` for anything
 * outside it. Restating those three lists here would be a value duplicated
 * across packages with no parity test to hold it — see the P4 plan's third
 * global constraint — so the screens read their options from Task 7's locale
 * keys and the server stays the judge.
 */
export interface OrderReasonInput {
	reason: string;
	note?: string;
}

export interface WithdrawalInput {
	items: Array<{ orderItemId: string; quantity: number }>;
	reasonText?: string | null;
}

/**
 * Every order mutation goes through this one hook, so the path comes from
 * `ORDER_ACTION_ROUTES` (the same table `availableActions` is built on) and
 * the invalidation is written once. Two roots are dropped on success: the
 * buyer's purchases, which covers both the list and the one order's detail,
 * and — when the caller is a seller screen — that shop's whole order queue,
 * which covers every tab, its counts and the order's seller-side detail. A
 * status change moves an order between tabs, so invalidating the open tab
 * alone would leave the tab it moved into stale.
 */
export function useOrderAction<TInput = void, TResult = OrderView>(
	action: OrderAction,
	target: OrderActionTarget,
) {
	const queryClient = useQueryClient();
	const { orderId, shopId } = target;
	return useMutation<TResult, ApiError, TInput>({
		mutationKey: ["orders", action, orderId],
		mutationFn: (input) =>
			apiPost<TResult>(
				orderActionPath(action, orderId),
				input === undefined ? undefined : input,
			),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: purchasesRootKey() });
			if (shopId) {
				void queryClient.invalidateQueries({
					queryKey: shopOrdersRootKey(shopId),
				});
			}
		},
	});
}

/** The printable receipt is a `GET` returning HTML, so it is a link, not a mutation. */
export function orderReceiptUrl(orderId: string, lang: "fr" | "en"): string {
	return `${orderActionPath("receipt", orderId)}?lang=${lang}`;
}

// --- The buyer's actions -------------------------------------------------

export function useConfirmOrderCode(target: OrderActionTarget) {
	return useOrderAction<{ code: string }>("confirm_code", target);
}

/** Answers `{ expiresAt }`; the plaintext code never leaves the SMS. */
export function useResendConfirmationCode(target: OrderActionTarget) {
	return useOrderAction<void, { expiresAt: string }>("resend_code", target);
}

export function useCancelOrder(target: OrderActionTarget) {
	return useOrderAction<{ reason?: string }>("cancel", target);
}

export function useConfirmReceipt(target: OrderActionTarget) {
	return useOrderAction<void>("confirm_receipt", target);
}

/** Answers `{ code }`: the handover code is shown to the buyer, by design. */
export function useRegenerateHandoverCode(target: OrderActionTarget) {
	return useOrderAction<void, { code: string }>(
		"regenerate_handover_code",
		target,
	);
}

export function useContestDelivery(target: OrderActionTarget) {
	return useOrderAction<{ note?: string }>("contest_delivery", target);
}

export function useRequestWithdrawal(target: OrderActionTarget) {
	return useOrderAction<
		WithdrawalInput,
		{ caseNumber: string; caseId: string }
	>("request_withdrawal", target);
}

// --- The shop's actions --------------------------------------------------

export function useAcceptOrder(target: OrderActionTarget) {
	return useOrderAction<void>("accept", target);
}

export function useDeclineOrder(target: OrderActionTarget) {
	return useOrderAction<OrderReasonInput>("decline", target);
}

/** Confirms *and* accepts in one transaction, so one call answers both. */
export function useConfirmByCall(target: OrderActionTarget) {
	return useOrderAction<void>("confirm_by_call", target);
}

export function useSellerCancelOrder(target: OrderActionTarget) {
	return useOrderAction<OrderReasonInput>("seller_cancel", target);
}

export function useShipOrder(target: OrderActionTarget) {
	return useOrderAction<void>("ship", target);
}

/**
 * A wrong code answers `order.handoverCodeInvalid` (or
 * `order.handoverLocked`) carrying `details.attemptsLeft` and
 * `details.handover.locked`, so the dialog reads the remaining attempts off
 * the error rather than guessing.
 */
export function useHandover(target: OrderActionTarget) {
	return useOrderAction<{ code: string }>("handover", target);
}

export function useDeclareDelivered(target: OrderActionTarget) {
	return useOrderAction<{ note?: string; photo?: string }>(
		"declare_delivered",
		target,
	);
}

export function useReportFailedAttempt(target: OrderActionTarget) {
	return useOrderAction<OrderReasonInput>("report_failed_attempt", target);
}

export function useMarkDeliveryFailed(target: OrderActionTarget) {
	return useOrderAction<OrderReasonInput>("mark_delivery_failed", target);
}
