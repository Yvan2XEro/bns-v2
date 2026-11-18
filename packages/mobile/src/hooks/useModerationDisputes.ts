import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
	DisputeOutcomeInput,
	DisputeOutcomePreview,
	ModerationDisputeRow,
	ModerationDisputeSheet,
} from "../../../api/src/contracts/disputes";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isModerator } from "../lib/moderation";

const rootKey = ["moderation", "disputes"] as const;
export const moderationDisputeDetailKey = (id: string) =>
	[...rootKey, id] as const;

export function useModerationDisputes() {
	const { user } = useAuth();
	return useQuery({
		queryKey: rootKey,
		queryFn: () => api.get<ModerationDisputeRow[]>("/api/moderation/disputes"),
		enabled: isModerator(user),
	});
}

export function useModerationDispute(id: string | undefined) {
	const { user } = useAuth();
	return useQuery({
		queryKey: moderationDisputeDetailKey(id ?? ""),
		queryFn: () =>
			api.get<ModerationDisputeSheet>(`/api/moderation/disputes/${id}`),
		enabled: Boolean(id) && isModerator(user),
	});
}

export function useModerationDisputeAction(id: string) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (input: ModerationDisputeAction) =>
			api.post(`/api/moderation/disputes/${id}`, input),
		onSuccess: async () => {
			await Promise.all([
				client.invalidateQueries({ queryKey: rootKey }),
				client.invalidateQueries({ queryKey: moderationDisputeDetailKey(id) }),
				client.invalidateQueries({ queryKey: ["moderation", "summary"] }),
			]);
		},
	});
}

export function usePreviewDisputeOutcome(id: string) {
	return useMutation({
		mutationFn: (refundAmount: number) =>
			api.post<DisputeOutcomePreview>(`/api/moderation/disputes/${id}`, {
				action: "preview",
				refundAmount,
			}),
	});
}

export type ModerationDisputeAction =
	| { action: "assign" }
	| { action: "request_info"; from: "buyer" | "seller"; message: string }
	| ({ action: "resolve" } & DisputeOutcomeInput & { note: string });
