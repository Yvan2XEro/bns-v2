"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useReducer } from "react";
import {
	type SubmitErrorHandler,
	useFieldArray,
	useForm,
	useWatch,
} from "react-hook-form";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useShopVariants } from "~/hooks/use-stock";
import { useStockCount } from "~/hooks/use-stock-count";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type CountFormState,
	type CountLine,
	clearDraft,
	countDeltas,
	countFormSchema,
	draftFromRows,
	hasAnyInput,
	rowsFromVariants,
	saveDraft,
} from "~/lib/inventory";
import { parseAmount } from "~/lib/product-form";
import { InventoryFilters } from "./inventory-filters";
import { InventoryHeader } from "./inventory-header";
import { InventoryNotices } from "./inventory-notices";
import { InventoryStats } from "./inventory-stats";
import { type FILTERS, InventoryTable } from "./inventory-table";
import { useInventoryHydration } from "./use-inventory-hydration";

interface State {
	filter: (typeof FILTERS)[number];
	q: string;
	startedAt: string;
	/** A transient success notice; a server refusal instead goes to formState.errors.root. */
	notice: string | null;
	/** Set by a failed submit, to move focus to the first row that needs fixing. */
	focusVariantId: string | null;
}

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

export function InventoryClient({
	shopId,
	showCost,
}: {
	shopId: string;
	/** The purchase cost is a shop secret: decided by role, never by whether a line happens to carry one. */
	showCost: boolean;
}) {
	const t = useTranslations("Inventory");
	const tRoot = useTranslations();
	const locale = useLocale();
	const variantsQuery = useShopVariants(shopId);
	const stockCount = useStockCount(shopId);
	const [state, patch] = useReducer(reducer, {
		filter: "all",
		q: "",
		startedAt: new Date().toISOString(),
		notice: null,
		focusVariantId: null,
	});

	const {
		clearErrors,
		control,
		formState,
		getValues,
		handleSubmit,
		register,
		reset,
		setError,
	} = useForm<CountFormState>({
		resolver: zodResolver(countFormSchema),
		defaultValues: { rows: [] },
	});
	const { fields } = useFieldArray({ control, name: "rows" });
	const rows = useWatch({ control, name: "rows" }) ?? [];

	useInventoryHydration({
		shopId,
		variants: variantsQuery.data?.docs,
		defaultLabel: t("defaultVariant"),
		reset,
		onDraftLoaded: (startedAt) => patch({ startedAt }),
	});

	// Moves focus to the first row a failed submit flagged, once the filter
	// and search that might have hidden it have cleared and it is on screen.
	useEffect(() => {
		if (!state.focusVariantId) return;
		document.getElementById(`count-${state.focusVariantId}`)?.focus();
		patch({ focusVariantId: null });
	}, [state.focusVariantId]);

	const lines: CountLine[] = rows.map((row) => ({
		variantId: row.variantId,
		expected: row.expected,
		counted: parseAmount(row.counted),
		cost: row.cost,
	}));
	const stats = countDeltas(lines);
	const invalidRows = Array.isArray(formState.errors.rows)
		? formState.errors.rows.filter(Boolean).length
		: 0;

	// A malformed count (non-numeric, non-blank text a pasted value or a
	// physical keyboard can produce despite inputMode="numeric") must never
	// make "Save the gaps" silently do nothing: it widens the filter/search so
	// the offending row is visible, focuses it, and a banner explains why
	// nothing was saved.
	const onInvalid: SubmitErrorHandler<CountFormState> = (errors) => {
		const rowErrors = errors.rows;
		const index = Array.isArray(rowErrors)
			? rowErrors.findIndex((entry) => entry?.counted)
			: -1;
		patch({
			filter: "all",
			q: "",
			focusVariantId: index >= 0 ? (rows[index]?.variantId ?? null) : null,
		});
	};

	async function onValid(values: CountFormState) {
		clearErrors("root");
		const counts = values.rows
			.map((row) => ({
				variantId: row.variantId,
				counted: parseAmount(row.counted),
			}))
			.filter(
				(entry): entry is { variantId: string; counted: number } =>
					entry.counted !== null,
			);
		if (counts.length === 0) return;
		try {
			const dateLabel = new Date(state.startedAt).toLocaleDateString(locale, {
				day: "numeric",
				month: "long",
			});
			const result = await stockCount.mutateAsync({
				counts,
				note: t("note", { date: dateLabel }),
			});
			const corrections = result.results.filter(
				(entry) => entry.delta !== 0,
			).length;
			clearDraft(shopId);
			const refreshed = await variantsQuery.refetch();
			const startedAt = new Date().toISOString();
			patch({ startedAt, notice: t("saved", { count: corrections }) });
			reset({
				rows: rowsFromVariants(
					refreshed.data?.docs ?? [],
					{ startedAt, counts: {} },
					t("defaultVariant"),
				),
			});
		} catch (err) {
			// The write is refused as one unit — a race, or units reserved
			// since the list loaded — so its answer is shown and not retried.
			setError("root", { message: resolveErrorMessage(err, tRoot) });
		}
	}

	const startedLabel = new Date(state.startedAt).toLocaleDateString(locale, {
		day: "numeric",
		month: "long",
	});

	return (
		<form
			onSubmit={handleSubmit(onValid, onInvalid)}
			noValidate
			className="space-y-5"
		>
			<InventoryHeader
				startedLabel={startedLabel}
				submitting={stockCount.isPending}
				submitDisabled={stockCount.isPending || !hasAnyInput(rows)}
				onSaveDraft={() => {
					saveDraft(shopId, draftFromRows(state.startedAt, getValues("rows")));
					patch({ notice: t("draftSaved") });
				}}
			/>

			<InventoryNotices
				notice={state.notice}
				invalidRows={invalidRows}
				errorMessage={formState.errors.root?.message ?? null}
			/>

			<InventoryStats stats={stats} total={fields.length} showCost={showCost} />

			<InventoryFilters
				filter={state.filter}
				onFilterChange={(filter) => patch({ filter })}
				q={state.q}
				onQueryChange={(q) => patch({ q })}
			/>

			{variantsQuery.isPending && <LoadingRows />}
			{variantsQuery.isError && (
				<LoadError
					title={t("errorTitle")}
					onRetry={() => variantsQuery.refetch()}
				/>
			)}
			{variantsQuery.isSuccess && (
				<InventoryTable
					fields={fields}
					rows={rows}
					register={register}
					errors={formState.errors.rows}
					filter={state.filter}
					query={state.q}
					showCost={showCost}
				/>
			)}
			<p className="text-[#64748B] text-xs">
				{t("footnote", { count: stats.withGap })}
			</p>
		</form>
	);
}
