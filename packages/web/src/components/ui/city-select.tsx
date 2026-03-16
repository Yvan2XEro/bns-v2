"use client";

import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CAMEROON_CITIES, type CameroonCity } from "~/lib/cameroon-cities";
import { cn } from "~/lib/utils";

interface CitySelectProps {
	value: string;
	onChange: (city: CameroonCity | null) => void;
	placeholder?: string;
	className?: string;
}

export function CitySelect({
	value,
	onChange,
	placeholder = "Choisir une ville",
	className,
}: CitySelectProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const containerRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	const filtered = CAMEROON_CITIES.filter(
		(c) =>
			!search.trim() ||
			c.name.toLowerCase().includes(search.toLowerCase()) ||
			c.region.toLowerCase().includes(search.toLowerCase()),
	);

	useEffect(() => {
		if (open) {
			setTimeout(() => searchRef.current?.focus(), 50);
		} else {
			setSearch("");
		}
	}, [open]);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		}
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		if (open) {
			document.addEventListener("mousedown", handleClickOutside);
			document.addEventListener("keydown", handleKeyDown);
		}
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [open]);

	return (
		<div ref={containerRef} className={cn("relative", className)}>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className={cn(
					"flex h-10 w-full items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm transition-all hover:border-[#94A3B8] focus:outline-none",
					open && "border-[#1E40AF] ring-2 ring-[#1E40AF]/20",
				)}
			>
				<MapPin className="h-4 w-4 shrink-0 text-[#94A3B8]" />
				<span
					className={cn(
						"flex-1 truncate text-left",
						value ? "text-[#0F172A]" : "text-[#94A3B8]",
					)}
				>
					{value || placeholder}
				</span>
				{value && (
					<button
						type="button"
						tabIndex={-1}
						onClick={(e) => {
							e.stopPropagation();
							onChange(null);
						}}
						className="rounded p-0.5 hover:bg-[#F1F5F9]"
					>
						<X className="h-3 w-3 text-[#94A3B8]" />
					</button>
				)}
				<ChevronDown
					className={cn(
						"h-4 w-4 shrink-0 text-[#94A3B8] transition-transform duration-200",
						open && "rotate-180",
					)}
				/>
			</button>

			{open && (
				<div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-xl">
					{/* Search input */}
					<div className="flex items-center gap-2 border-[#E2E8F0] border-b px-3 py-2.5">
						<Search className="h-4 w-4 shrink-0 text-[#94A3B8]" />
						<input
							ref={searchRef}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Rechercher une ville..."
							className="flex-1 bg-transparent text-[#0F172A] text-sm outline-none placeholder:text-[#94A3B8]"
						/>
					</div>

					{/* City list */}
					<ul className="max-h-60 overflow-y-auto py-1">
						{filtered.length === 0 ? (
							<li className="px-4 py-4 text-center text-[#94A3B8] text-sm">
								Aucun résultat
							</li>
						) : (
							filtered.map((city) => (
								<li key={city.name}>
									<button
										type="button"
										onClick={() => {
											onChange(city);
											setOpen(false);
										}}
										className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#F8FAFC]"
									>
										<div className="flex-1">
											<div className="font-medium text-[#0F172A] text-sm">
												{city.name}
											</div>
											<div className="text-[#94A3B8] text-xs">
												{city.region}
											</div>
										</div>
										{value === city.name && (
											<Check className="h-4 w-4 shrink-0 text-[#1E40AF]" />
										)}
									</button>
								</li>
							))
						)}
					</ul>
				</div>
			)}
		</div>
	);
}
