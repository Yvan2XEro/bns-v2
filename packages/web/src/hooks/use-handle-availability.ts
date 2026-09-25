"use client";

import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { shopApi } from "~/lib/shop-api";
import { isHandleFormatValid } from "~/lib/shop-handle";
import type { HandleAvailability } from "~/types";

export type HandleStatus =
	| "idle"
	| "checking"
	| "available"
	| "current"
	| "invalid"
	| "reserved"
	| "taken"
	| "error";

/** Every availability answer, so a failed create can drop them all at once. */
export const handleAvailabilityRootKey = ["shops", "handle-available"] as const;

export const handleAvailabilityKey = (handle: string) =>
	[...handleAvailabilityRootKey, handle] as const;

const DEBOUNCE_MS = 350;

/**
 * Live availability of a shop handle.
 *
 * The answer is advisory: the handle can still be taken between this check and
 * the create call, so the caller must map the server's own error back to the
 * field rather than trusting "available".
 */
export function useHandleAvailability(
	handle: string,
	options: { currentHandle?: string } = {},
): { status: HandleStatus } {
	const debounced = useDebouncedValue(handle, DEBOUNCE_MS);
	const isCurrent =
		Boolean(options.currentHandle) && handle === options.currentHandle;
	const formatValid = isHandleFormatValid(handle);
	const settled = debounced === handle;
	const enabled = Boolean(handle) && formatValid && !isCurrent && settled;

	const query = useQuery<HandleAvailability>({
		queryKey: handleAvailabilityKey(debounced),
		queryFn: () => shopApi.handleAvailable(debounced),
		enabled,
		retry: false,
	});

	return { status: statusOf() };

	function statusOf(): HandleStatus {
		if (!handle) return "idle";
		if (isCurrent) return "current";
		if (!formatValid) return "invalid";
		if (!settled || query.isPending || query.isFetching) return "checking";
		if (query.isError || !query.data) return "error";
		if (query.data.available) return "available";
		return query.data.reason ?? "taken";
	}
}
