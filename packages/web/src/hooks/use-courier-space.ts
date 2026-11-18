"use client";

import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { type CourierTab, tabStatus } from "~/lib/courier-space";
import { courierSpaceKey } from "~/lib/query-keys";
import { apiGet, apiPost, query } from "~/lib/shop-api";
import type { CourierShipmentRow } from "../../../api/src/contracts/shipments";
import type { CourierMember } from "../../../api/src/payload-types";

interface CourierPage {
	rows: CourierShipmentRow[];
	nextCursor: string | null;
}

/** The courier's shipments; a stranger to every courier answers `shipment.notAssigned` (403). */
export function useCourierShipments(tab: CourierTab) {
	return useInfiniteQuery<CourierPage, ApiError>({
		queryKey: [...courierSpaceKey(), "shipments", tab],
		queryFn: ({ pageParam }) =>
			apiGet<CourierPage>(
				`/api/courier/shipments${query({
					status: tabStatus(tab),
					cursor: pageParam as string | undefined,
				})}`,
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		retry: false,
	});
}

/**
 * The caller's own memberships, plus every member of a courier they
 * dispatch for: that is the collection's own read rule, so the rider picker
 * needs no route of its own.
 */
export function useCourierMembers(enabled: boolean) {
	return useQuery<CourierMember[], ApiError>({
		queryKey: [...courierSpaceKey(), "members"],
		queryFn: async () =>
			(
				await apiGet<{ docs: CourierMember[] }>(
					"/api/courier-members?where[status][equals]=active&limit=100&depth=1",
				)
			).docs,
		enabled,
		retry: false,
	});
}

function useCourierMutation<TVars>(
	key: string,
	mutationFn: (vars: TVars) => Promise<unknown>,
) {
	const queryClient = useQueryClient();
	return useMutation<unknown, ApiError, TVars>({
		mutationKey: [...courierSpaceKey(), key],
		mutationFn,
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: [...courierSpaceKey(), "shipments"],
			});
		},
	});
}

export const useAssignCourierRider = () =>
	useCourierMutation(
		"assign",
		(vars: { shipmentId: string; riderUserId: string }) =>
			apiPost(
				`/api/courier/shipments/${encodeURIComponent(vars.shipmentId)}/assign`,
				{ riderUserId: vars.riderUserId },
			),
	);

export const useDeclareRemitted = () =>
	useCourierMutation(
		"remitted",
		(vars: { shipmentId: string; note?: string }) =>
			apiPost(
				`/api/courier/shipments/${encodeURIComponent(vars.shipmentId)}/cod-remitted`,
				vars.note ? { note: vars.note } : {},
			),
	);
