"use client";

import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	ApiError,
	apiErrorFrom,
	ERROR_CODES,
	fallbackFor,
} from "~/lib/apiError";
import { downloadCsv } from "~/lib/csv";
import { type LogFilters, logCsvFilename, logPath } from "~/lib/moderation-log";
import {
	type ModerationShopSheet,
	type PayoutActionBody,
	type ShopFilters,
	type SuspendBody,
	shopsPath,
	type UnsuspendBody,
} from "~/lib/moderation-shops";
import { moderationConsoleKeys } from "~/lib/query-keys";
import { apiGet, apiPost } from "~/lib/shop-api";
import type {
	ModerationLogResponse,
	ModerationShopSearchResponse,
} from "../../../api/src/contracts/moderationConsole";
import { useInvalidateModeration } from "./use-moderation-console";

export function useModerationShops(filters: ShopFilters) {
	const key = {
		...(filters.q ? { q: filters.q } : {}),
		...(filters.status ? { status: filters.status } : {}),
	};
	return useInfiniteQuery<
		ModerationShopSearchResponse,
		ApiError,
		InfiniteData<ModerationShopSearchResponse>,
		ReturnType<typeof moderationConsoleKeys.shops>,
		string | null
	>({
		queryKey: moderationConsoleKeys.shops(key),
		queryFn: ({ pageParam }) =>
			apiGet<ModerationShopSearchResponse>(shopsPath(key, pageParam)),
		initialPageParam: null,
		getNextPageParam: (last) => last.nextCursor,
		retry: false,
	});
}

export function useModerationShopSheet(id: string) {
	return useQuery<ModerationShopSheet, ApiError>({
		queryKey: moderationConsoleKeys.shop(id),
		queryFn: () =>
			apiGet<ModerationShopSheet>(
				`/api/moderation/shops/${encodeURIComponent(id)}`,
			),
		enabled: Boolean(id),
		retry: false,
	});
}

/** Suspending or lifting touches listings, reports and the queue too: the whole console refreshes. */
export function useShopSuspension(shopId: string) {
	const invalidate = useInvalidateModeration();
	const client = useQueryClient();
	return useMutation<unknown, ApiError, SuspendBody | UnsuspendBody>({
		mutationFn: (body) =>
			apiPost(`/api/moderation/shops/${encodeURIComponent(shopId)}`, body),
		onSuccess: () =>
			Promise.all([
				invalidate(),
				client.invalidateQueries({ queryKey: ["shops"] }),
				client.invalidateQueries({ queryKey: ["listings"] }),
			]),
	});
}

export function useShopPayoutAction(shopId: string) {
	const invalidate = useInvalidateModeration();
	return useMutation<unknown, ApiError, PayoutActionBody>({
		mutationFn: (body) =>
			apiPost(
				`/api/moderation/shops/${encodeURIComponent(shopId)}/payouts`,
				body,
			),
		onSuccess: invalidate,
	});
}

export function useModerationLog(filters: LogFilters) {
	const key = Object.fromEntries(
		Object.entries(filters).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	);
	return useInfiniteQuery<
		ModerationLogResponse,
		ApiError,
		InfiniteData<ModerationLogResponse>,
		ReturnType<typeof moderationConsoleKeys.log>,
		string | null
	>({
		queryKey: moderationConsoleKeys.log(key),
		queryFn: ({ pageParam }) =>
			apiGet<ModerationLogResponse>(logPath(filters, { cursor: pageParam })),
		initialPageParam: null,
		getNextPageParam: (last) => last.nextCursor,
		retry: false,
	});
}

/** The same filters as the list, as the API's CSV (5,000 rows at most), saved as a file. */
export function useExportLogCsv() {
	return useMutation<void, ApiError, LogFilters>({
		mutationFn: async (filters) => {
			let response: Response;
			try {
				response = await fetch(logPath(filters, { format: "csv" }), {
					credentials: "include",
				});
			} catch {
				throw new ApiError(
					fallbackFor(ERROR_CODES.network),
					0,
					ERROR_CODES.network,
				);
			}
			if (!response.ok)
				throw apiErrorFrom(
					response.status,
					await response.json().catch(() => ({})),
				);
			// The BOM makes spreadsheet apps read the accents as UTF-8, as `toCsv` does.
			const text = (await response.text()).replace(/^﻿/, "");
			downloadCsv(logCsvFilename(), `﻿${text}`);
		},
	});
}
