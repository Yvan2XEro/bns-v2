"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useReducer, useRef } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
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
	loadDraft,
	rowsFromVariants,
	saveDraft,
} from "~/lib/inventory";
import { parseAmount } from "~/lib/product-form";
import { InventoryFilters } from "./inventory-filters";
import { InventoryHeader } from "./inventory-header";
import { InventoryStats } from "./inventory-stats";
import { type FILTERS, InventoryTable } from "./inventory-table";

interface State {
	filter: (typeof FILTERS)[number];
	q: string;
	startedAt: string;
	/** A transient success notice; a server refusal instead goes to formState.errors.root. */
	notice: string | null;
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

	// Hydrates the form once, from whichever arrives: the saved draft (read
	// synchronously) plus the variant list (a query). A later background
	// refetch of the same query (e.g. on window focus) must not wipe counts
	// the seller is mid-typing, hence the one-shot guard.
	const initialized = useRef(false);
	useEffect(() => {
		if (initialized.current || !variantsQuery.data) return;
		initialized.current = true;
		const draft = loadDraft(shopId) ?? {
			startedAt: new Date().toISOString(),
			counts: {},
		};
		patch({ startedAt: draft.startedAt });
		reset({
			rows: rowsFromVariants(
				variantsQuery.data.docs,
				draft,
				t("defaultVariant"),
			),
		});
	}, [variantsQuery.data, shopId, reset, t]);

	const lines: CountLine[] = rows.map((row) => ({
		variantId: row.variantId,
		expected: row.expected,
		counted: parseAmount(row.counted),
		cost: row.cost,
	}));
	const stats = countDeltas(lines);

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
	const errorMessage = formState.errors.root?.message ?? null;

	return (
		<form onSubmit={handleSubmit(onValid)} noValidate className="space-y-5">
			<InventoryHeader
				startedLabel={startedLabel}
				submitting={stockCount.isPending}
				submitDisabled={stockCount.isPending || stats.counted === 0}
				onSaveDraft={() => {
					saveDraft(shopId, draftFromRows(state.startedAt, getValues("rows")));
					patch({ notice: t("draftSaved") });
				}}
			/>

			{state.notice && (
				<p className="rounded-lg bg-[#F0FDF4] px-3 py-2 text-[#166534] text-sm">
					{state.notice}
				</p>
			)}
			{errorMessage && (
				<p
					role="alert"
					className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
				>
					{errorMessage}
				</p>
			)}

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
