"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { riderLinkKey } from "~/lib/query-keys";
import type { GpsPoint, ProofKind } from "~/lib/rider-page";
import { apiGet, apiPost, apiPostForm } from "~/lib/shop-api";
import type { RiderLinkView } from "../../../api/src/contracts/shipments";

const base = (token: string) =>
	`/api/public/rider/${encodeURIComponent(token)}`;

/**
 * The token-addressed projection, read once and never polled: a link that was
 * revoked answers 404 on the next press, and the page shows its generic screen.
 */
export function useRiderView(token: string) {
	return useQuery<RiderLinkView, ApiError>({
		queryKey: riderLinkKey(token),
		queryFn: () => apiGet<RiderLinkView>(base(token)),
		retry: false,
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});
}

function useRiderAction<TBody, TResult>(token: string, path: string) {
	const queryClient = useQueryClient();
	return useMutation<TResult, ApiError, TBody>({
		mutationKey: ["rider-link", token, path],
		mutationFn: (body) => apiPost<TResult>(`${base(token)}/${path}`, body),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: riderLinkKey(token) });
		},
	});
}

export const useRiderPickedUp = (token: string) =>
	useRiderAction<{ gps?: GpsPoint }, { id: string; status: string }>(
		token,
		"picked-up",
	);

export const useRiderAttempt = (token: string) =>
	useRiderAction<
		{ reason: string; note?: string; gps?: GpsPoint; photoId?: string },
		{ id: string; status: string }
	>(token, "attempts");

/**
 * No invalidation on success: a delivered parcel closes the link, so the next
 * read would be a 404. The page shows its own "delivered" screen instead.
 */
export function useRiderHandover(token: string) {
	return useMutation<
		{ id: string; status: string },
		ApiError,
		{ code: string; gps?: GpsPoint; photoId?: string }
	>({
		mutationKey: ["rider-link", token, "handover"],
		mutationFn: (body) =>
			apiPost<{ id: string; status: string }>(`${base(token)}/handover`, body),
		retry: false,
	});
}

export function useRiderPhoto(token: string) {
	return useMutation<
		{ id: string; kind: ProofKind },
		ApiError,
		{ file: File; kind: ProofKind }
	>({
		mutationKey: ["rider-link", token, "photo"],
		mutationFn: ({ file, kind }) => {
			const form = new FormData();
			form.append("file", file);
			form.append("kind", kind);
			return apiPostForm<{ id: string; kind: ProofKind }>(
				`${base(token)}/photo`,
				form,
			);
		},
		retry: false,
	});
}
