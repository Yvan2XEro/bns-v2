"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CitySelect } from "~/components/ui/city-select";
import type { CameroonCity } from "~/lib/cameroon-cities";

export function HomeSearchBar() {
	const router = useRouter();
	const [query, setQuery] = useState("");
	const [city, setCity] = useState<CameroonCity | null>(null);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const params = new URLSearchParams();
		if (query.trim()) params.set("q", query.trim());
		if (city) params.set("location", city.name);
		router.push(`/search?${params.toString()}`);
	};

	return (
		<form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
			<div className="relative rounded-[30px] bg-white/95 p-1.5 shadow-[0_28px_60px_-28px_rgba(15,23,42,0.55)] ring-1 ring-white/45 backdrop-blur transition-all duration-300 focus-within:scale-[1.01] focus-within:shadow-[0_32px_70px_-28px_rgba(15,23,42,0.65)]">
				<div className="flex min-h-16 flex-col gap-1 rounded-[26px] bg-white sm:flex-row sm:items-stretch">
					<div className="relative min-w-0 flex-1">
						<Search className="-translate-y-1/2 absolute top-1/2 left-5 h-5 w-5 text-[#94A3B8]" />
						<input
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Rechercher des articles, voitures, téléphones..."
							className="h-14 w-full border-0 bg-transparent pr-4 pl-14 text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none sm:h-[62px]"
						/>
					</div>
					<div className="hidden items-center py-2 sm:flex">
						<div className="h-9 w-px bg-[#E2E8F0]" />
					</div>
					<div className="hidden shrink-0 sm:flex sm:w-[17rem]">
						<CitySelect
							value={city?.name ?? ""}
							onChange={setCity}
							placeholder="Choisir une ville"
							variant="hero"
							className="w-full"
							dropdownClassName="right-0 left-auto"
						/>
					</div>
					<button
						type="submit"
						className="flex h-14 items-center justify-center gap-2 rounded-[22px] bg-[#F59E0B] px-6 font-semibold text-[#0F172A] transition-all duration-200 hover:bg-[#D97706] active:scale-[0.98] sm:h-[62px] sm:px-8"
					>
						<Search className="h-5 w-5" />
						<span>Rechercher</span>
					</button>
				</div>
			</div>
		</form>
	);
}
