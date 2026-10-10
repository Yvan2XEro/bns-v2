"use client";

import { useEffect, useRef } from "react";
import type { UseFormReset } from "react-hook-form";
import {
	type CountFormState,
	loadDraft,
	rowsFromVariants,
} from "~/lib/inventory";
import type { PopulatedVariant } from "~/lib/shop-api";

/**
 * Hydrates the count form once per shop, from whichever arrives: the saved
 * draft (read synchronously) plus the variant list (a query). A later
 * background refetch of the same query (e.g. on window focus) must not wipe
 * counts the seller is mid-typing, hence the one-shot guard — keyed by
 * shopId so switching shops re-hydrates instead of keeping the previous
 * shop's rows.
 */
export function useInventoryHydration({
	shopId,
	variants,
	defaultLabel,
	reset,
	onDraftLoaded,
}: {
	shopId: string;
	variants: PopulatedVariant[] | undefined;
	defaultLabel: string;
	reset: UseFormReset<CountFormState>;
	onDraftLoaded: (startedAt: string) => void;
}) {
	const initializedFor = useRef<string | null>(null);
	useEffect(() => {
		if (initializedFor.current === shopId || !variants) return;
		initializedFor.current = shopId;
		const draft = loadDraft(shopId) ?? {
			startedAt: new Date().toISOString(),
			counts: {},
		};
		onDraftLoaded(draft.startedAt);
		reset({ rows: rowsFromVariants(variants, draft, defaultLabel) });
	}, [variants, shopId, reset, defaultLabel, onDraftLoaded]);
}
