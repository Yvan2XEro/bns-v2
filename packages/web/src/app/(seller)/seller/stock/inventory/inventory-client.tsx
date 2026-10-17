"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useReducer, useRef } from "react";
import {
	type SubmitErrorHandler,
	useFieldArray,
	useForm,
	useWatch,
} from "react-hook-form";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useCatalogueStockT } from "~/hooks/use-catalogue-stock-t";
import { useInventoryVariants } from "~/hooks/use-inventory-variants";
import { useStockCount } from "~/hooks/use-stock-count";
import {
	useSaveStockCountProgress,
	useStartStockCount,
	useStockCountOverview,
} from "~/hooks/use-stock-count-session";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type CountFormState,
	type CountLine,
	categoryFamily,
	countDeltas,
	countFormSchema,
	draftFromRows,
	hasAnyInput,
	rowsFromVariants,
	visibleRowIndexes,
} from "~/lib/inventory";
import { parseAmount } from "~/lib/product-form";
import { relationId } from "~/lib/relation-id";
import type { Category } from "~/types";
import { InventoryFilters } from "./inventory-filters";
import { InventoryHeader } from "./inventory-header";
import { InventoryNotices } from "./inventory-notices";
import { InventoryStats } from "./inventory-stats";
import { type FILTERS, InventoryTable } from "./inventory-table";
import { useInventoryHydration } from "./use-inventory-hydration";

const PAGE_SIZE = 25;

interface State {
	filter: (typeof FILTERS)[number];
	q: string;
	category: string;
	page: number;
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
	categories,
}: {
	shopId: string;
	/** The purchase cost is a shop secret: decided by role, never by whether a line happens to carry one. */
	showCost: boolean;
	categories: Category[];
}) {
	const t = useTranslations("Inventory");
	const ti = useCatalogueStockT("inventory");
	const tRoot = useTranslations();
	const locale = useLocale();
	const variantsQuery = useInventoryVariants(shopId);
	const overview = useStockCountOverview(shopId);
	const startCount = useStartStockCount(shopId);
	const saveProgress = useSaveStockCountProgress(shopId);
	const stockCount = useStockCount(shopId);
	const [state, patch] = useReducer(reducer, {
		filter: "all",
		q: "",
		category: "",
		page: 1,
		notice: null,
		focusVariantId: null,
	});

	const session = overview.data?.session ?? null;
	const startedOnce = useRef(false);
	// Opening the count screen is what starts a count; one already open — by
	// anyone in the shop — is resumed instead.
	useEffect(() => {
		if (startedOnce.current || !overview.data || overview.data.session) return;
		startedOnce.current = true;
		startCount.mutate({});
	}, [overview.data, startCount]);

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
		draft: overview.isError
			? null
			: overview.data
				? session
					? { startedAt: session.startedAt, counts: session.counts }
					: null
				: undefined,
		defaultLabel: t("defaultVariant"),
		reset,
	});

	// Moves focus to the first row a failed submit flagged, once the filter,
	// search and page that might have hidden it have cleared and it is on screen.
	useEffect(() => {
		if (!state.focusVariantId) return;
		document.getElementById(`count-${state.focusVariantId}`)?.focus();
		patch({ focusVariantId: null });
	}, [state.focusVariantId]);

	const categoryOptions = useMemo(() => {
		const used = new Set(
			fields.map((field) => field.categoryId).filter(Boolean) as string[],
		);
		return categories
			.filter((category) =>
				[...used].some((id) => categoryFamily(categories, category.id).has(id)),
			)
			.map((category) => ({
				id: category.id,
				label: relationId(category.parent)
					? `— ${category.name}`
					: category.name,
			}));
	}, [categories, fields]);
	const categoryIds = useMemo(
		() => (state.category ? categoryFamily(categories, state.category) : null),
		[categories, state.category],
	);

	const lines: CountLine[] = rows.map((row) => ({
		variantId: row.variantId,
		expected: row.expected,
		counted: parseAmount(row.counted),
		cost: row.cost,
	}));
	const stats = countDeltas(lines);
	const units = lines.reduce(
		(sum, line) => ({
			counted: sum.counted + (line.counted ?? 0),
			expected: sum.expected + line.expected,
		}),
		{ counted: 0, expected: 0 },
	);
	const invalidRows = Array.isArray(formState.errors.rows)
		? formState.errors.rows.filter(Boolean).length
		: 0;
	const visible = visibleRowIndexes(rows, {
		filter: state.filter,
		query: state.q,
		categoryIds,
		parse: parseAmount,
	});
	const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
	const page = Math.min(state.page, pageCount);
	const pageIndexes = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	// A malformed count (non-numeric, non-blank text a pasted value or a
	// physical keyboard can produce despite inputMode="numeric") must never
	// make "Save the gaps" silently do nothing: it widens the filters and
	// moves to the page of the offending row, focuses it, and a banner
	// explains why nothing was saved.
	const onInvalid: SubmitErrorHandler<CountFormState> = (errors) => {
		const rowErrors = errors.rows;
		const index = Array.isArray(rowErrors)
			? rowErrors.findIndex((entry) => entry?.counted)
			: -1;
		patch({
			filter: "all",
			q: "",
			category: "",
			page: index >= 0 ? Math.floor(index / PAGE_SIZE) + 1 : 1,
			focusVariantId: index >= 0 ? (rows[index]?.variantId ?? null) : null,
		});
	};

	const startedAt = session?.startedAt ?? null;
	const dayLabel = (iso: string | null) =>
		new Date(iso ?? Date.now()).toLocaleDateString(locale, {
			day: "numeric",
			month: "long",
		});

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
			const result = await stockCount.mutateAsync({
				counts,
				note: t("note", { date: dayLabel(startedAt) }),
				...(session ? { sessionId: session.id } : {}),
			});
			const corrections = result.results.filter(
				(entry) => entry.delta !== 0,
			).length;
			const refreshed = await variantsQuery.refetch();
			patch({ notice: t("saved", { count: corrections }), page: 1 });
			reset({
				rows: rowsFromVariants(
					refreshed.data?.docs ?? [],
					{ startedAt: new Date().toISOString(), counts: {} },
					t("defaultVariant"),
				),
			});
		} catch (err) {
			// The write is refused as one unit — a race, or units reserved
			// since the list loaded — so its answer is shown and not retried.
			setError("root", { message: resolveErrorMessage(err, tRoot) });
		}
	}

	async function saveDraft(locationId?: string | null) {
		const counts = draftFromRows(startedAt ?? "", getValues("rows")).counts;
		try {
			const current =
				session ??
				(await startCount.mutateAsync({ locationId: locationId ?? null }));
			await saveProgress.mutateAsync({
				sessionId: current.id,
				counts,
				...(locationId !== undefined ? { locationId } : {}),
			});
			await overview.refetch();
			if (locationId === undefined) patch({ notice: ti("draftSaved") });
		} catch (err) {
			setError("root", { message: resolveErrorMessage(err, tRoot) });
		}
	}

	const startedBy = session
		? session.startedBy
			? ti("startedBy", {
					time: new Date(session.startedAt).toLocaleTimeString(locale, {
						hour: "2-digit",
						minute: "2-digit",
					}),
					name: session.startedBy.name,
				})
			: ti("startedAt", {
					time: new Date(session.startedAt).toLocaleTimeString(locale, {
						hour: "2-digit",
						minute: "2-digit",
					}),
				})
		: null;
	const submitDisabled = stockCount.isPending || !hasAnyInput(rows);

	return (
		<form
			onSubmit={handleSubmit(onValid, onInvalid)}
			noValidate
			className="space-y-5"
		>
			<InventoryHeader
				startedLabel={dayLabel(startedAt)}
				submitting={stockCount.isPending}
				submitDisabled={submitDisabled}
				savingDraft={saveProgress.isPending}
				onSaveDraft={() => void saveDraft()}
			/>

			<InventoryNotices
				notice={state.notice}
				invalidRows={invalidRows}
				errorMessage={formState.errors.root?.message ?? null}
			/>

			<InventoryStats
				stats={stats}
				total={fields.length}
				units={units}
				showCost={showCost}
				startedBy={startedBy}
			/>

			<InventoryFilters
				filter={state.filter}
				onFilterChange={(filter) => patch({ filter, page: 1 })}
				counts={{
					all: fields.length,
					todo: fields.length - stats.counted,
					counted: stats.counted,
					gap: stats.withGap,
				}}
				q={state.q}
				onQueryChange={(q) => patch({ q, page: 1 })}
				onQuerySubmit={() => {
					const first = visible[0];
					if (first === undefined) return;
					document.getElementById(`count-${rows[first]?.variantId}`)?.focus();
				}}
				categoryOptions={categoryOptions}
				category={state.category}
				onCategoryChange={(category) => patch({ category, page: 1 })}
				locations={overview.data?.locations ?? []}
				location={session?.location?.id ?? ""}
				onLocationChange={(value) => void saveDraft(value || null)}
			/>

			{variantsQuery.isPending && <LoadingRows />}
			{variantsQuery.isError && (
				<LoadError
					title={t("errorTitle")}
					onRetry={() => variantsQuery.refetch()}
				/>
			)}
			{variantsQuery.isSuccess && (
				<div className="overflow-hidden rounded-xl border border-line bg-surface">
					<InventoryTable
						fields={fields}
						rows={rows}
						register={register}
						errors={formState.errors.rows}
						indexes={pageIndexes}
						showCost={showCost}
					/>
					<div className="flex flex-wrap items-center gap-3 border-line border-t bg-canvas px-4 py-3 print:hidden">
						<p className="text-ink-muted text-xs">
							{ti("footnote", {
								count: stats.withGap,
								date: dayLabel(null),
							})}
						</p>
						<div className="flex flex-wrap items-center gap-2 text-sm sm:ml-auto">
							{visible.length > 0 && (
								<span className="text-ink-muted">
									{ti("range", {
										from: (page - 1) * PAGE_SIZE + 1,
										to: (page - 1) * PAGE_SIZE + pageIndexes.length,
										total: visible.length,
									})}
								</span>
							)}
							<button
								type="button"
								disabled={page <= 1}
								onClick={() => patch({ page: page - 1 })}
								className="h-9 rounded-lg border border-line bg-surface px-3 disabled:opacity-40"
							>
								{ti("previous")}
							</button>
							<button
								type="button"
								disabled={page >= pageCount}
								onClick={() => patch({ page: page + 1 })}
								className="h-9 rounded-lg border border-line bg-surface px-3 disabled:opacity-40"
							>
								{ti("next")}
							</button>
							<button
								type="submit"
								disabled={submitDisabled}
								className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] px-4 font-semibold text-[var(--shop-on-accent,#FFFFFF)] disabled:opacity-50"
							>
								{stockCount.isPending && (
									<LoaderCircle
										aria-hidden="true"
										className="h-4 w-4 animate-spin"
									/>
								)}
								{t("submit")}
							</button>
						</div>
					</div>
				</div>
			)}
		</form>
	);
}
