"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LocationField } from "~/components/location/location-field";
import { useSearchSuggestions } from "~/components/search/search-suggestions";
import { usePlacePreferences } from "~/hooks/use-place-preferences";

export function HomeSearchBar() {
	const t = useTranslations("Home");
	const router = useRouter();
	const [query, setQuery] = useState("");
	// The city scope is a remembered preference: "All cities" until chosen.
	const { browsePlace, setBrowsePlace } = usePlacePreferences();

	const suggestions = useSearchSuggestions({
		query,
		city: browsePlace?.name ?? null,
		onSearch: (q) => {
			const params = new URLSearchParams();
			if (q.trim()) params.set("q", q.trim());
			if (browsePlace) params.set("location", browsePlace.name);
			router.push(`/search?${params.toString()}`);
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		suggestions.submit();
	};

	return (
		<form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
			<div className="relative rounded-[18px] bg-white/95 p-1.5 shadow-[0_28px_60px_-28px_rgba(15,23,42,0.55)] ring-1 ring-white/45 backdrop-blur transition-all duration-300 focus-within:scale-[1.01] focus-within:shadow-[0_32px_70px_-28px_rgba(15,23,42,0.65)]">
				<div className="flex min-h-16 flex-col gap-1 rounded-[14px] bg-white sm:flex-row sm:items-stretch">
					<div className="relative min-w-0 flex-1">
						<Search className="-translate-y-1/2 absolute top-1/2 left-5 h-5 w-5 text-[#94A3B8]" />
						<input
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							{...suggestions.inputProps}
							placeholder={t("whatLookingFor")}
							className="h-14 w-full border-0 bg-transparent pr-4 pl-14 text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none sm:h-[62px]"
						/>
						{suggestions.panel}
					</div>
					<div className="hidden items-center py-2 sm:flex">
						<div className="h-9 w-px bg-[#E2E8F0]" />
					</div>
					<div className="shrink-0 border-[#F1F5F9] border-t sm:w-[17rem] sm:border-t-0">
						<LocationField
							value={browsePlace}
							onChange={setBrowsePlace}
							variant="hero"
							browse
						/>
					</div>
					<button
						type="submit"
						className="flex h-14 items-center justify-center gap-2 rounded-[10px] bg-[#F59E0B] px-6 font-bold text-[#0F172A] transition-all duration-200 hover:bg-[#D97706] active:scale-[0.98] sm:h-[62px] sm:px-8"
					>
						{t("searchButton")}
					</button>
				</div>
			</div>
		</form>
	);
}
