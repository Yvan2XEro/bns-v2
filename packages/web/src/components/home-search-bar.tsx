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
		<form onSubmit={handleSubmit} className="mx-auto max-w-xl">
			<div className="flex overflow-hidden rounded-2xl bg-white shadow-black/10 shadow-xl transition-all duration-300 focus-within:scale-[1.01] focus-within:shadow-2xl focus-within:shadow-black/15">
				<div className="relative flex-1">
					<Search className="-translate-y-1/2 absolute top-1/2 left-4 h-5 w-5 text-[#94A3B8]" />
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Rechercher des articles, voitures, téléphones..."
						className="h-14 w-full border-0 bg-transparent pr-4 pl-12 text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none"
					/>
				</div>
				<div className="hidden items-center border-[#E2E8F0] border-l sm:flex">
					<CitySelect
						value={city?.name ?? ""}
						onChange={setCity}
						placeholder="Ville"
						className="w-44 rounded-none border-0 shadow-none [&>button]:h-14 [&>button]:rounded-none [&>button]:border-0 [&>button]:shadow-none [&>div]:rounded-b-2xl"
					/>
				</div>
				<button
					type="submit"
					className="flex items-center gap-2 bg-[#F59E0B] px-6 font-semibold text-[#0F172A] transition-all duration-200 hover:bg-[#D97706] active:scale-95 sm:px-8"
				>
					<Search className="h-5 w-5" />
					<span className="hidden sm:inline">Rechercher</span>
				</button>
			</div>
		</form>
	);
}
