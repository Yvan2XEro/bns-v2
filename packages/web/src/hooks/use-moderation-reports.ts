"use client";

import {
	type InfiniteData,
	useInfiniteQuery,
	useMutation,
	useQuery,
} from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import {
	type ListingAction,
	type PayloadPage,
	pendingListingsPath,
	type ReportFilters,
	type ReportOutcome,
	reportsPath,
	targetReportsPath,
} from "~/lib/moderation-reports";
import { moderationConsoleKeys } from "~/lib/query-keys";
import { apiGet, apiPost } from "~/lib/shop-api";
import type { Listing, Report } from "~/types";
import { useInvalidateModeration } from "./use-moderation-console";

function usePagedList<T>(
	queryKey: readonly unknown[],
	path: (page: number) => string,
) {
	return useInfiniteQuery<
		PayloadPage<T>,
		ApiError,
		InfiniteData<PayloadPage<T>>,
		readonly unknown[],
		number
	>({
		queryKey,
		queryFn: ({ pageParam }) => apiGet<PayloadPage<T>>(path(pageParam)),
		initialPageParam: 1,
		getNextPageParam: (last) =>
			last.hasNextPage ? (last.nextPage ?? undefined) : undefined,
		retry: false,
	});
}

export function useReportsList(filters: ReportFilters) {
	const key = {
		status: filters.status,
		...(filters.reason ? { reason: filters.reason } : {}),
		...(filters.target ? { target: filters.target } : {}),
	};
	return usePagedList<Report>(moderationConsoleKeys.reports(key), (page) =>
		reportsPath(filters, page),
	);
}

export function usePendingListings() {
	return usePagedList<Listing>(moderationConsoleKeys.listings, (page) =>
		pendingListingsPath(page),
	);
}

/** Read by id so a shared `?item=` link opens even when the item is not on a loaded page. */
export function useModerationReport(id: string | null) {
	return useQuery<Report, ApiError>({
		queryKey: moderationConsoleKeys.report(id ?? ""),
		queryFn: () =>
			apiGet<Report>(`/api/reports/${encodeURIComponent(id ?? "")}?depth=1`),
		enabled: Boolean(id),
		retry: false,
	});
}

export function useModerationListing(id: string | null) {
	return useQuery<Listing, ApiError>({
		queryKey: moderationConsoleKeys.listing(id ?? ""),
		queryFn: () =>
			apiGet<Listing>(`/api/listings/${encodeURIComponent(id ?? "")}?depth=1`),
		enabled: Boolean(id),
		retry: false,
	});
}

export function useTargetReports(target: { type: string; id: string } | null) {
	return useQuery<PayloadPage<Report>, ApiError>({
		queryKey: moderationConsoleKeys.targetReports(
			target?.type ?? "",
			target?.id ?? "",
		),
		queryFn: () =>
			apiGet<PayloadPage<Report>>(
				targetReportsPath(target?.type ?? "", target?.id ?? ""),
			),
		enabled: Boolean(target),
		retry: false,
	});
}

/** The parts of the moderation account and shop sheets a report preview shows. */
export interface ReportedAccount {
	user: { id: string; name?: string | null; email?: string | null };
	suspension?: { active?: boolean } | null;
	counts?: { reportsAgainst?: number } | null;
}

export interface ReportedShop {
	shop: { id: string; name: string; handle?: string | null; status?: string };
	counts?: { reportsAgainst?: number } | null;
}

export type ReportTargetPreview =
	| { type: "listing"; listing: Listing }
	| { type: "user"; account: ReportedAccount }
	| { type: "shop"; shop: ReportedShop }
	| { type: "none" };

async function fetchTargetPreview(
	type: string,
	id: string,
): Promise<ReportTargetPreview> {
	const safe = encodeURIComponent(id);
	if (type === "listing")
		return {
			type,
			listing: await apiGet<Listing>(`/api/listings/${safe}?depth=1`),
		};
	if (type === "user")
		return {
			type,
			account: await apiGet<ReportedAccount>(`/api/moderation/users/${safe}`),
		};
	if (type === "shop")
		return {
			type,
			shop: await apiGet<ReportedShop>(`/api/moderation/shops/${safe}`),
		};
	return { type: "none" };
}

export function useReportTarget(target: { type: string; id: string } | null) {
	return useQuery<ReportTargetPreview, ApiError>({
		queryKey: moderationConsoleKeys.reportTarget(
			target?.type ?? "",
			target?.id ?? "",
		),
		queryFn: () => fetchTargetPreview(target?.type ?? "", target?.id ?? ""),
		enabled: Boolean(target),
		retry: false,
	});
}

export function useReportDecision() {
	const invalidate = useInvalidateModeration();
	return useMutation<
		{ id: string; status: string },
		ApiError,
		{ id: string; body: { outcome: ReportOutcome; resolution?: string } }
	>({
		mutationFn: ({ id, body }) =>
			apiPost(`/api/moderation/reports/${encodeURIComponent(id)}`, body),
		onSuccess: invalidate,
	});
}

export function useListingDecision() {
	const invalidate = useInvalidateModeration();
	return useMutation<
		unknown,
		ApiError,
		{
			id: string;
			body: { action: ListingAction; reason?: string; note?: string };
		}
	>({
		mutationFn: ({ id, body }) =>
			apiPost(`/api/moderation/listings/${encodeURIComponent(id)}`, body),
		onSuccess: invalidate,
	});
}
