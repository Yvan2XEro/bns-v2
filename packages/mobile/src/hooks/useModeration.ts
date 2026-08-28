import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isModerator } from "../lib/moderation";
import type {
	ListingDoc,
	ModerationSummary,
	ModerationUserSheet,
	PayloadPage,
	ReportDoc,
	SuspensionReason,
} from "../types/api";

export interface SuspendResponse {
	userId: string;
	until: string | null;
	unpublishedListingIds: string[];
}

export interface UnsuspendResponse {
	userId: string;
	restoredListingIds: string[];
}

const PAGE_SIZE = 20;

/** Everything the moderation surface reads or writes, so cache keys stay in one place. */
export const moderationKeys = {
	summary: ["moderation", "summary"] as const,
	listings: ["moderation", "listings"] as const,
	reports: ["moderation", "reports"] as const,
	user: (id: string) => ["moderation", "user", id] as const,
};

export function useIsModerator(): boolean {
	const { user } = useAuth();
	return isModerator(user);
}

/** Pending counts for the account-screen entry and its badge. */
export function useModerationSummary() {
	const enabled = useIsModerator();

	return useQuery({
		queryKey: moderationKeys.summary,
		queryFn: () => api.get<ModerationSummary>("/api/moderation/summary"),
		enabled,
		staleTime: 30_000,
		refetchInterval: enabled ? 60_000 : false,
	});
}

/**
 * Queues read straight from the Payload REST API: `Listings.read` and
 * `Reports.read` already return everything to a moderator, so there is no
 * custom endpoint to maintain for them.
 */
export function usePendingListings() {
	const enabled = useIsModerator();

	return useInfiniteQuery({
		queryKey: moderationKeys.listings,
		enabled,
		initialPageParam: 1,
		queryFn: ({ pageParam }) =>
			api.get<PayloadPage<ListingDoc>>(
				`/api/listings?where[status][equals]=pending&sort=createdAt&depth=1&limit=${PAGE_SIZE}&page=${pageParam}`,
			),
		getNextPageParam: (last) =>
			last.hasNextPage ? (last.nextPage ?? undefined) : undefined,
	});
}

export function usePendingReports() {
	const enabled = useIsModerator();

	return useInfiniteQuery({
		queryKey: moderationKeys.reports,
		enabled,
		initialPageParam: 1,
		queryFn: ({ pageParam }) =>
			api.get<PayloadPage<ReportDoc>>(
				`/api/reports?where[status][equals]=pending&sort=createdAt&depth=1&limit=${PAGE_SIZE}&page=${pageParam}`,
			),
		getNextPageParam: (last) =>
			last.hasNextPage ? (last.nextPage ?? undefined) : undefined,
	});
}

export function useModerationUser(userId: string | undefined) {
	const enabled = useIsModerator();

	return useQuery({
		queryKey: moderationKeys.user(userId ?? ""),
		queryFn: () =>
			api.get<ModerationUserSheet>(`/api/moderation/users/${userId}`),
		enabled: Boolean(userId) && enabled,
	});
}

/**
 * Mutations invalidate the queue and the summary together: a decision changes
 * both the list and the badge, and leaving the badge stale is how a moderator
 * ends up opening an empty queue.
 */
function useModerationMutation<TVars, TData>(
	mutationFn: (vars: TVars) => Promise<TData>,
	extraKeys: readonly (readonly unknown[])[] = [],
) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: moderationKeys.summary });
			queryClient.invalidateQueries({ queryKey: moderationKeys.listings });
			queryClient.invalidateQueries({ queryKey: moderationKeys.reports });
			for (const key of extraKeys) {
				queryClient.invalidateQueries({ queryKey: key });
			}
		},
	});
}

export function useListingDecision() {
	return useModerationMutation(
		({
			listingId,
			action,
			reason,
			note,
		}: {
			listingId: string;
			action: "approve" | "reject";
			reason?: string;
			note?: string;
		}) =>
			api.post(`/api/moderation/listings/${listingId}`, {
				action,
				reason,
				note,
			}),
		[["listings"], ["listing"]],
	);
}

export function useReportDecision() {
	return useModerationMutation(
		({
			reportId,
			outcome,
			resolution,
		}: {
			reportId: string;
			outcome: "resolved" | "dismissed";
			resolution?: string;
		}) =>
			api.post(`/api/moderation/reports/${reportId}`, { outcome, resolution }),
	);
}

export function useSuspendUser() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			userId,
			reason,
			durationDays,
			note,
		}: {
			userId: string;
			reason: SuspensionReason;
			/** `null` is an explicit indefinite suspension; admins only. */
			durationDays: number | null;
			note?: string;
		}) =>
			api.post<SuspendResponse>(`/api/moderation/users/${userId}`, {
				action: "suspend",
				reason,
				durationDays,
				note,
			}),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({
				queryKey: moderationKeys.user(variables.userId),
			});
			queryClient.invalidateQueries({ queryKey: moderationKeys.summary });
			queryClient.invalidateQueries({ queryKey: moderationKeys.listings });
			queryClient.invalidateQueries({ queryKey: ["listings"] });
		},
	});
}

export function useUnsuspendUser() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			userId,
			note,
			restoreListings = true,
		}: {
			userId: string;
			note?: string;
			restoreListings?: boolean;
		}) =>
			api.post<UnsuspendResponse>(`/api/moderation/users/${userId}`, {
				action: "unsuspend",
				note,
				restoreListings,
			}),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({
				queryKey: moderationKeys.user(variables.userId),
			});
			queryClient.invalidateQueries({ queryKey: ["listings"] });
		},
	});
}
