"use client";

import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { useCatalogue } from "~/hooks/use-catalogue";
import { useDebouncedValue } from "~/hooks/use-debounced-value";

/** Picks one of the shop's own products to open its resale settings. */
export function OfferProductPicker({
	shopId,
	children,
}: {
	shopId: string;
	children: ReactNode;
}) {
	const t = useTranslations("SellerResaleHub");
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const q = useDebouncedValue(search.trim(), 250);
	const catalogue = useCatalogue(shopId, {
		status: "active",
		q: q || undefined,
		page: 1,
		limit: 12,
	});
	const rows = (catalogue.data?.docs ?? []).filter(
		(row) => row.provenance !== "resale",
	);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<button
					type="button"
					className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--shop-accent,var(--c-brand))] px-4 font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))]"
				>
					{children}
				</button>
			</DialogTrigger>
			<DialogContent className="max-w-lg">
				<DialogTitle>{t("pickerTitle")}</DialogTitle>
				<DialogDescription>{t("pickerDescription")}</DialogDescription>
				<label className="relative block">
					<span className="sr-only">{t("searchProduct")}</span>
					<Search
						aria-hidden="true"
						className="absolute top-3 left-3 h-4 w-4 text-ink-faint"
					/>
					<input
						type="search"
						value={search}
						maxLength={120}
						onChange={(event) => setSearch(event.target.value)}
						placeholder={t("searchProduct")}
						className="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-[var(--shop-accent,var(--c-brand))] focus:ring-2 focus:ring-[var(--shop-accent-border,var(--c-brand-tint))]"
					/>
				</label>
				<ul className="max-h-80 divide-y divide-subtle overflow-y-auto">
					{catalogue.isError ? (
						<li className="py-3 text-ink-muted text-sm">{t("pickerError")}</li>
					) : catalogue.data && rows.length === 0 ? (
						<li className="py-3 text-ink-muted text-sm">{t("pickerEmpty")}</li>
					) : null}
					{rows.map((row) => (
						<li key={row.id}>
							<Link
								href={`/seller/resale/products/${encodeURIComponent(row.id)}`}
								onClick={() => setOpen(false)}
								className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-[var(--shop-accent-text,var(--c-brand))]"
							>
								<span className="min-w-0 truncate font-medium">
									{row.title}
								</span>
								<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
							</Link>
						</li>
					))}
				</ul>
			</DialogContent>
		</Dialog>
	);
}
