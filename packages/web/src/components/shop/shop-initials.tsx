import { cn } from "~/lib/utils";

export function initialsOf(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	return (words[0]?.[0] ?? "?").concat(words[1]?.[0] ?? "").toUpperCase();
}

/** Logo stand-in, as in the mockups: two letters on the primary colour. */
export function ShopInitials({
	name,
	logoUrl,
	className,
}: {
	name: string;
	logoUrl?: string | null;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#1E40AF] font-bold text-white",
				className,
			)}
		>
			{logoUrl ? (
				// biome-ignore lint/performance/noImgElement: logos come from arbitrary storage hosts
				<img src={logoUrl} alt={name} className="h-full w-full object-cover" />
			) : (
				initialsOf(name)
			)}
		</div>
	);
}
