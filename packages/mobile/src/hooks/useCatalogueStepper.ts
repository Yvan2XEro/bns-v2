import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useReducer, useRef } from "react";
import { AppState } from "react-native";
import { useAlert } from "@/src/contexts/AlertContext";
import { shopKeys, useRecordMovement } from "@/src/hooks/useShops";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import {
	needsFlush,
	rowsNeedingFlush,
	type StepAction,
	type StepState,
	stepReducer,
} from "@/src/lib/catalogueStepper";
import { useTranslation } from "@/src/lib/i18n";
import type {
	CatalogueFilter,
	CatalogueResponse,
	CatalogueRow,
	PayloadPage,
	VariantDoc,
} from "@/src/types/api";

// Long enough to coalesce a burst of taps into one write, short enough that
// a single tap still feels like it moved stock promptly.
const STEP_DEBOUNCE_MS = 450;

/**
 * Owns the catalogue quick stepper: coalescing taps into one stock-movement
 * write per row, keeping at most one write in flight per row, and making
 * sure a tap the seller sees applied is always either sent or visibly rolled
 * back — never left pending indefinitely and never silently dropped when the
 * screen goes away.
 *
 * "Goes away" covers two cases, handled the same way: the screen unmounts
 * (the seller navigates off), or the app is backgrounded/inactivated. Both
 * force-flush every row still owed a write, bypassing whatever remains of
 * its debounce window — a `setTimeout` is not reliable once the app is
 * backgrounded, and an unmounted screen will never get another tap to
 * trigger the flush on its own. Rows already mid-flight are left alone:
 * their request is already in progress and cannot be sped up or cancelled.
 */
export function useCatalogueStepper(
	shopId: string | undefined,
	filter: CatalogueFilter,
) {
	const { t } = useTranslation();
	const { showError } = useAlert();
	const queryClient = useQueryClient();
	const record = useRecordMovement();

	const [stepState, dispatchStep] = useReducer(stepReducer, {});
	// `stepState` only updates on the next render; the debounce timer, the
	// teardown flush and the mutation's async continuation all need the
	// *current* pending delta synchronously, so a ref mirrors it, advanced
	// through the same reducer.
	const stepRef = useRef<StepState>(stepState);
	const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map(),
	);
	// Rows a teardown might need to flush without a tap having happened again.
	const rowsRef = useRef<Map<string, CatalogueRow>>(new Map());
	// Always points at this render's `flush`, so the teardown effect below can
	// stay subscribed for the hook's whole lifetime (deps `[]`) instead of
	// tearing down and re-flushing on every unrelated re-render, while still
	// calling a `flush` closed over the current `shopId`/`filter`.
	const flushRef = useRef<((row: CatalogueRow) => Promise<void>) | null>(null);

	function applyStep(action: StepAction) {
		stepRef.current = stepReducer(stepRef.current, action);
		dispatchStep(action);
	}

	/** Sends a row's net pending delta as a single stock movement. */
	async function flush(row: CatalogueRow) {
		const id = shopId;
		const delta = stepRef.current[row.id]?.pending ?? 0;
		if (delta === 0 || !id) return;
		applyStep({ type: "start", rowId: row.id });
		try {
			const variants = await queryClient.fetchQuery({
				queryKey: shopKeys.variants(row.id),
				queryFn: () =>
					api.get<PayloadPage<VariantDoc>>(
						`/api/product-variants?where[product][equals]=${row.id}&where[archivedAt][exists]=false&limit=2&depth=0`,
					),
				staleTime: 5 * 60_000,
			});
			const variant = variants.docs[0];
			if (!variant) throw new Error("Catalogue row has no variant");
			const result = await record.mutateAsync({
				variantId: variant.id,
				type: "adjustment",
				quantity: delta,
				note: t("catalogue.quickStepNote"),
			});
			// `useRecordMovement` already kicks off a broader invalidation on
			// success, but `invalidateQueries` never rejects — query-core
			// swallows a failed background refetch — so it is no guarantee the
			// list actually picked up the change. The mutation's own response
			// carries the server's authoritative post-write count; write it
			// into the cached row directly so it reflects the server's truth
			// regardless of whether that refetch succeeds.
			patchRow(
				id,
				row.id,
				result.variant.stockOnHand,
				result.variant.stockReserved,
			);
			applyStep({ type: "settle", rowId: row.id, appliedDelta: delta });
			void queryClient.invalidateQueries({
				queryKey: shopKeys.catalogue(id, filter),
			});
			// A tap that landed while this request was in flight has no timer
			// armed for it (the stepper buttons are disabled while committing,
			// so arming one would just reopen the same race) — send it now.
			if (needsFlush(stepRef.current, row.id)) {
				await flush(row);
			}
		} catch (error) {
			// Never retried: the server's refusal (e.g. stock would go negative)
			// is shown verbatim, and the pending delta is dropped so the row
			// falls back to the last confirmed number instead of an unconfirmed
			// one.
			applyStep({ type: "fail", rowId: row.id });
			showError(t("catalogue.stepError"), resolveErrorMessage(error, t));
		}
	}

	function patchRow(
		shopIdValue: string,
		rowId: string,
		stockOnHand: number,
		stockReserved: number,
	) {
		queryClient.setQueryData<CatalogueResponse>(
			shopKeys.catalogue(shopIdValue, filter),
			(prev) => {
				if (!prev) return prev;
				return {
					...prev,
					docs: prev.docs.map((r) =>
						r.id === rowId
							? {
									...r,
									stockOnHand,
									available: Math.max(0, stockOnHand - stockReserved),
								}
							: r,
					),
				};
			},
		);
	}

	function armTimer(row: CatalogueRow) {
		const timers = timersRef.current;
		const existing = timers.get(row.id);
		if (existing) clearTimeout(existing);
		timers.set(
			row.id,
			setTimeout(() => {
				timers.delete(row.id);
				void flush(row);
			}, STEP_DEBOUNCE_MS),
		);
	}

	function step(row: CatalogueRow, delta: 1 | -1) {
		rowsRef.current.set(row.id, row);
		const wasCommitting = stepRef.current[row.id]?.committing ?? false;
		applyStep({ type: "queue", rowId: row.id, delta });
		// Only a race with the mutation's own async continuation, never a
		// second tap: `flush` re-checks `needsFlush` after settling.
		if (wasCommitting) return;
		armTimer(row);
	}

	flushRef.current = flush;

	// Subscribed once for the hook's whole lifetime: the AppState listener and
	// the unmount cleanup both call through `flushRef`, so they always reach
	// this render's `flush` (current `shopId`/`filter`) without the effect
	// itself needing to re-subscribe on every change.
	useEffect(() => {
		function flushTeardown() {
			for (const timer of timersRef.current.values()) clearTimeout(timer);
			timersRef.current.clear();
			for (const rowId of rowsNeedingFlush(stepRef.current)) {
				const row = rowsRef.current.get(rowId);
				if (row) void flushRef.current?.(row);
			}
		}
		const sub = AppState.addEventListener("change", (state) => {
			if (state === "background" || state === "inactive") flushTeardown();
		});
		return () => {
			sub.remove();
			flushTeardown();
		};
	}, []);

	return { stepState, step };
}
