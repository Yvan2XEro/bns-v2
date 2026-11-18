import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import type {
	ReturnAction,
	ReturnCaseListPage,
	ReturnCaseView,
} from "../../../api/src/contracts/returns";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { returnActionEndpoint } from "../lib/returnActionEndpoint";

const rootKey = ["cases", "returns"] as const;
export const buyerReturnsKey = [...rootKey, "buyer"] as const;
export const shopReturnsKey = (shopId: string) =>
	[...rootKey, "shop", shopId] as const;
export const returnDetailKey = (id: string) =>
	[...rootKey, "detail", id] as const;

export function useBuyerReturns() {
	const { user } = useAuth();
	return useQuery({
		queryKey: buyerReturnsKey,
		queryFn: () => api.get<ReturnCaseListPage>("/api/me/returns"),
		enabled: Boolean(user),
		retry: false,
	});
}

export function useShopReturns(shopId: string | undefined) {
	return useQuery({
		queryKey: shopReturnsKey(shopId ?? ""),
		queryFn: () =>
			api.get<ReturnCaseListPage>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/returns`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}

export function useReturnCase(id: string | undefined) {
	return useQuery({
		queryKey: returnDetailKey(id ?? ""),
		queryFn: () =>
			api.get<ReturnCaseView>(`/api/returns/${encodeURIComponent(id ?? "")}`),
		enabled: Boolean(id),
		retry: false,
	});
}

export function useReturnAction(id: string) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({ action, body }: { action: ReturnAction; body?: unknown }) =>
			api.post(
				`/api/returns/${encodeURIComponent(id)}/${returnActionEndpoint(action)}`,
				body ?? {},
			),
		onSuccess: async () => {
			await Promise.all([
				client.invalidateQueries({ queryKey: rootKey }),
				client.invalidateQueries({ queryKey: returnDetailKey(id) }),
			]);
		},
	});
}

export interface ReturnEvidenceAsset {
	uri: string;
	fileName: string | null;
	kind: "photo" | "payment_proof";
}

export function useUploadReturnEvidence(id: string) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: async (asset: ReturnEvidenceAsset) => {
			const file = new File(asset.uri);
			const form = new FormData();
			form.append("file", file, asset.fileName?.trim() || file.name);
			form.append("kind", asset.kind);
			return api.upload<{ id: string }>(
				`/api/returns/${encodeURIComponent(id)}/evidence`,
				form,
			);
		},
		onSuccess: async () =>
			client.invalidateQueries({ queryKey: returnDetailKey(id) }),
	});
}
