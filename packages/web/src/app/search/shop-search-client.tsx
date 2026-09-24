"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { ShopCard } from "~/components/shop/shop-card";
import { CitySelect } from "~/components/ui/city-select";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { useShopSearch } from "~/hooks/use-shop-search";

export function ShopSearchClient({
	initialQ,
	initialCity,
}: {
	initialQ: string;
	initialCity: string;
}) {
	const t = useTranslations("Search");
	const router = useRouter();
	const [q, setQ] = useState(initialQ);
	const [city, setCity] = useState(initialCity);
	const debouncedQ = useDebouncedValue(q, 300).trim();
	const debouncedCity = useDebouncedValue(city, 300);

	// Keeps the URL shareable; the debounced values (not every keystroke) are the source of truth for it.
	// Skips the replace when it would be a no-op (e.g. on mount), so this never adds a history call the URL doesn't need.
	useEffect(() => {
		const params = new URLSearchParams({ tab: "shops" });
		if (debouncedQ) params.set("q", debouncedQ);
		if (debouncedCity) params.set("city", debouncedCity);
		const search = `?${params.toString()}`;
		if (window.location.search === search) return;
		router.replace(`/search${search}`, { scroll: false });
	}, [debouncedQ, debouncedCity, router]);

	const { data, isPending, isError, refetch } = useShopSearch({
		q: debouncedQ,
		city: debouncedCity,
		limit: 30,
	});

	return (
		<div className="container mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
			<div className="flex flex-col gap-3 sm:flex-row">
				<div className="relative flex-1">
					<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-[#94A3B8]" />
					<input
						type="search"
						value={q}
						onChange={(event) => setQ(event.target.value)}
						placeholder={t("shopSearchPlaceholder")}
						className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white pr-3 pl-9 text-sm focus:border-[#93C5FD] focus:outline-none"
					/>
				</div>
				<div className="sm:w-60">
					<CitySelect
						value={city}
						onChange={(selected) => setCity(selected?.name ?? "")}
						placeholder={t("allCities")}
					/>
				</div>
			</div>

			{isPending && <LoadingRows rows={4} />}
			{isError && (
				<LoadError title={t("shopSearchError")} onRetry={() => refetch()} />
			)}
			{!isPending && !isError && data && (
				<>
					<p className="text-[#64748B] text-sm">
						{city
							? t("shopCountIn", { count: data.total, city })
							: t("shopCount", { count: data.total })}
					</p>
					{data.hits.length === 0 ? (
						<div className="rounded-xl border border-[#E2E8F0] border-dashed bg-white p-10 text-center">
							<p className="font-semibold text-[#0F172A]">
								{t("noShopsTitle")}
							</p>
							<p className="mt-1 text-[#64748B] text-sm">{t("noShopsBody")}</p>
							{(q || city) && (
								<button
									type="button"
									onClick={() => {
										setQ("");
										setCity("");
									}}
									className="mt-4 h-10 rounded-lg border border-[#E2E8F0] px-4 font-semibold text-sm"
								>
									{t("clearFilters")}
								</button>
							)}
						</div>
					) : (
						<div className="space-y-3">
							{data.hits.map((shop) => (
								<ShopCard key={shop.id} shop={shop} />
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}
