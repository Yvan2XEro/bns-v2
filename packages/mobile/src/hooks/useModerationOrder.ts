import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { StaffCancelInput } from "../lib/staffOrderSheet";
import type { OrderStatus, OrderView } from "../types/order";
import { useIsModerator } from "./useModeration";

export const moderationOrderKey = (orderId: string) =>
	["moderation", "order", orderId] as const;

/**
 * `GET /api/moderation/orders/{id}` — the order's own staff projection, with
 * the buyer's tier and at-placement refusal count on `risk`. No phone-score
 * row is ever read for it.
 */
export function useModerationOrder(orderId: string | undefined) {
	const enabled = useIsModerator();
	return useQuery({
		queryKey: moderationOrderKey(orderId ?? ""),
		queryFn: () => api.get<OrderView>(`/api/moderation/orders/${orderId}`),
		enabled: enabled && Boolean(orderId),
	});
}

/** The moderator's only lever on an order: cancel it, with a staff reason. */
export function useStaffCancelOrder(orderId: string | undefined) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: StaffCancelInput) =>
			api.post<{ id: string; status: OrderStatus }>(
				`/api/moderation/orders/${orderId}`,
				{ action: "cancel", reason: input.reason, note: input.note },
			),
		onSuccess: () => {
			if (!orderId) return;
			queryClient.invalidateQueries({
				queryKey: moderationOrderKey(orderId),
			});
			queryClient.invalidateQueries({ queryKey: ["moderation", "summary"] });
		},
	});
}
