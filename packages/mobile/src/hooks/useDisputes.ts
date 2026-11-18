import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import type {
	DisputeListPage,
	DisputeView,
	OpenDisputeInput,
} from "../../../api/src/contracts/disputes";
import { API_BASE_URL, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { signedEvidenceUrl } from "../lib/disputeEvidence";

const rootKey = ["cases", "disputes"] as const;
export const buyerDisputesKey = [...rootKey, "buyer"] as const;
export const disputeDetailKey = (id: string) =>
	[...rootKey, "detail", id] as const;

export function useBuyerDisputes() {
	const { user } = useAuth();
	return useQuery({
		queryKey: buyerDisputesKey,
		queryFn: () => api.get<DisputeListPage>("/api/me/disputes"),
		enabled: Boolean(user),
		retry: false,
	});
}

export function useDispute(id: string | undefined) {
	return useQuery({
		queryKey: disputeDetailKey(id ?? ""),
		queryFn: () =>
			api.get<DisputeView>(`/api/disputes/${encodeURIComponent(id ?? "")}`),
		enabled: Boolean(id),
		retry: false,
	});
}

export function useDisputeAction(id: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { action: string; body?: unknown }) => {
			const endpoint =
				input.action === "message"
					? "messages"
					: input.action.startsWith("proposal_")
						? "proposal"
						: input.action.startsWith("respond_")
							? "respond"
							: input.action;
			return api.post(
				`/api/disputes/${encodeURIComponent(id)}/${endpoint}`,
				input.body ?? {},
			);
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: buyerDisputesKey }),
				queryClient.invalidateQueries({ queryKey: disputeDetailKey(id) }),
			]);
		},
	});
}

export interface DisputeEvidenceAsset {
	uri: string;
	fileName: string | null;
	mimeType: string | null;
}

export function uploadDisputeEvidence(
	disputeId: string,
	asset: DisputeEvidenceAsset,
	kind: "photo" | "video" | "document" = "photo",
) {
	const file = new File(asset.uri);
	const formData = new FormData();
	formData.append("file", file, asset.fileName?.trim() || file.name);
	formData.append("kind", kind);
	return api.upload<{ id: string; kind: string }>(
		`/api/disputes/${encodeURIComponent(disputeId)}/evidence`,
		formData,
	);
}

export function useUploadDisputeEvidence(id: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (asset: DisputeEvidenceAsset) =>
			uploadDisputeEvidence(id, asset),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: disputeDetailKey(id) });
		},
	});
}

export function useSubmitDispute(id: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () =>
			api.post<{ id: string; status: string }>(
				`/api/disputes/${encodeURIComponent(id)}/submit`,
				{},
			),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: buyerDisputesKey }),
				queryClient.invalidateQueries({ queryKey: disputeDetailKey(id) }),
			]);
		},
	});
}

/** `useSubmitDispute` for a case whose id is only known after it is opened. */
export function useSubmitOpenedDispute() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			api.post<{ id: string; status: string }>(
				`/api/disputes/${encodeURIComponent(id)}/submit`,
				{},
			),
		onSuccess: async (_data, id) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: buyerDisputesKey }),
				queryClient.invalidateQueries({ queryKey: disputeDetailKey(id) }),
			]);
		},
	});
}

export function useOpenDispute(orderId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: OpenDisputeInput) =>
			api.post<{ id: string; number: string; status: string }>(
				`/api/orders/${encodeURIComponent(orderId)}/disputes`,
				input,
			),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: buyerDisputesKey }),
				queryClient.invalidateQueries({ queryKey: ["purchases"] }),
			]);
		},
	});
}

export const disputeEvidenceUrlKey = (id: string, evidenceId: string) =>
	[...rootKey, "detail", id, "evidence-url", evidenceId] as const;

/**
 * `POST …/evidence/{evidenceId}/url` checks the caller's access, records the
 * view and signs a five-minute URL. The answer is reused for four minutes so a
 * re-render neither logs another view nor serves an expired link.
 */
export function evidenceUrlQuery(id: string, evidenceId: string) {
	return {
		queryKey: disputeEvidenceUrlKey(id, evidenceId),
		queryFn: async () => {
			const signed = await api.post<{
				url: string;
				expiresAt: string;
				mimeType: string;
			}>(
				`/api/disputes/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}/url`,
				{},
			);
			return { ...signed, url: signedEvidenceUrl(signed.url, API_BASE_URL) };
		},
		staleTime: 4 * 60_000,
		gcTime: 4 * 60_000,
		retry: false,
	};
}

export function useDisputeEvidenceUrl(
	id: string,
	evidenceId: string,
	enabled = true,
) {
	return useQuery({ ...evidenceUrlQuery(id, evidenceId), enabled });
}
