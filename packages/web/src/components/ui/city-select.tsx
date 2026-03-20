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
	variant?: "default" | "hero";
	dropdownClassName?: string;
}

export function CitySelect({
	value,
	onChange,
	placeholder = "Choisir une ville",
	className,
	variant = "default",
	dropdownClassName,
}: CitySelectProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const containerRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const selectedCity =
		CAMEROON_CITIES.find((city) => city.name === value) ?? null;
	const isHero = variant === "hero";

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
				aria-expanded={open}
				aria-haspopup="listbox"
				className={cn(
					"flex w-full items-center gap-2 text-sm transition-all focus:outline-none",
					isHero
						? "h-14 bg-transparent px-4 text-[#0F172A]"
						: "h-10 rounded-lg border border-[#E2E8F0] bg-white px-3 hover:border-[#94A3B8]",
					open &&
						(isHero
							? "text-[#1E3A8A]"
							: "border-[#1E40AF] ring-2 ring-[#1E40AF]/20"),
				)}
			>
				<div
					className={cn(
						"flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
						isHero
							? "bg-[#EFF6FF] text-[#2563EB]"
							: "bg-transparent text-[#94A3B8]",
					)}
				>
					<MapPin className="h-4 w-4" />
				</div>
				<span
					className={cn(
						"flex-1 truncate text-left",
						value ? "text-[#0F172A]" : "text-[#94A3B8]",
						isHero && value && "font-medium",
					)}
				>
					{value || placeholder}
				</span>
				{selectedCity && (
					<span
						className={cn(
							"hidden truncate rounded-full px-2 py-1 font-medium text-[11px] sm:inline-flex",
							isHero
								? "bg-[#FFF7ED] text-[#C2410C]"
								: "bg-[#F8FAFC] text-[#64748B]",
						)}
					>
						{selectedCity.region}
					</span>
				)}
				<ChevronDown
					className={cn(
						"h-4 w-4 shrink-0 text-[#94A3B8] transition-transform duration-200",
						open && "rotate-180",
					)}
				/>
			</button>
			{value && (
				<button
					type="button"
					tabIndex={-1}
					onClick={(e) => {
						e.stopPropagation();
						onChange(null);
					}}
					aria-label="Clear city"
					className={cn(
						"-translate-y-1/2 absolute top-1/2 rounded-full transition-colors",
						isHero
							? "right-8 p-1 hover:bg-[#EFF6FF]"
							: "right-7 p-0.5 hover:bg-[#F1F5F9]",
					)}
				>
					<X className="h-3 w-3 text-[#94A3B8]" />
				</button>
			)}

			{open && (
				<div
					className={cn(
						"absolute top-[calc(100%+10px)] left-0 z-[70] overflow-hidden border bg-white",
						isHero
							? "w-[min(26rem,calc(100vw-2rem))] rounded-[24px] border-[#BFDBFE] shadow-[0_28px_60px_-24px_rgba(15,23,42,0.35)]"
							: "mt-1 w-full rounded-xl border-[#E2E8F0] shadow-xl",
						dropdownClassName,
					)}
				>
					<div
						className={cn(
							"flex items-center gap-2 border-b px-3",
							isHero
								? "border-[#DBEAFE] bg-[#F8FBFF] py-3"
								: "border-[#E2E8F0] py-2.5",
						)}
					>
						<Search className="h-4 w-4 shrink-0 text-[#94A3B8]" />
						<input
							ref={searchRef}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Rechercher une ville..."
							className={cn(
								"flex-1 bg-transparent text-[#0F172A] text-sm outline-none placeholder:text-[#94A3B8]",
								isHero && "font-medium",
							)}
						/>
					</div>

					<ul className="max-h-72 overflow-y-auto p-2">
						{filtered.length === 0 ? (
							<li className="px-4 py-5 text-center text-[#94A3B8] text-sm">
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
										className={cn(
											"flex w-full items-center gap-3 text-left transition-colors",
											isHero
												? "rounded-2xl px-4 py-3 hover:bg-[#F8FAFF]"
												: "px-4 py-2.5 hover:bg-[#F8FAFC]",
										)}
									>
										<div
											className={cn(
												"flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
												isHero ? "bg-[#EFF6FF]" : "bg-[#F8FAFC]",
											)}
										>
											<MapPin
												className={cn(
													"h-4 w-4",
													isHero ? "text-[#2563EB]" : "text-[#94A3B8]",
												)}
											/>
										</div>
										<div className="min-w-0 flex-1">
											<div className="font-medium text-[#0F172A] text-sm">
												{city.name}
											</div>
											<div className="truncate text-[#94A3B8] text-xs">
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
