"use client";

import { useEffect, useRef } from "react";
import type { UseFormReset } from "react-hook-form";
import {
	type CountFormState,
	type InventoryDraft,
	rowsFromVariants,
} from "~/lib/inventory";
import type { InventoryVariant } from "~/lib/shop-api";

/**
 * Hydrates the count form once per shop, once both the variant list and the
 * server-side count (or the knowledge that there is none) have arrived. A
 * later background refetch (e.g. on window focus) must not wipe counts the
 * seller is mid-typing, hence the one-shot guard — keyed by shopId so
 * switching shops re-hydrates instead of keeping the previous shop's rows.
 */
export function useInventoryHydration({
	shopId,
	variants,
	draft,
	defaultLabel,
	reset,
}: {
	shopId: string;
	variants: InventoryVariant[] | undefined;
	/** Undefined while the session is still loading; null when there is none. */
	draft: InventoryDraft | null | undefined;
	defaultLabel: string;
	reset: UseFormReset<CountFormState>;
}) {
	const initializedFor = useRef<string | null>(null);
	useEffect(() => {
		if (initializedFor.current === shopId || !variants || draft === undefined)
			return;
		initializedFor.current = shopId;
		reset({
			rows: rowsFromVariants(
				variants,
				draft ?? { startedAt: new Date().toISOString(), counts: {} },
				defaultLabel,
			),
		});
	}, [variants, draft, shopId, reset, defaultLabel]);
}
