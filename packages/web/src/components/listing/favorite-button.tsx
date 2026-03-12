"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "~/lib/utils";
import { toggleFavorite } from "~/lib/actions";
import { useAuth } from "~/hooks/use-auth";

interface FavoriteButtonProps {
	listingId: number;
	initialFavorite?: boolean;
	className?: string;
	showLabel?: boolean;
}

export function FavoriteButton({ listingId, initialFavorite = false, className, showLabel = false }: FavoriteButtonProps) {
	const { user } = useAuth();
	const router = useRouter();
	const [isFavorite, setIsFavorite] = useState(initialFavorite);
	const [isPending, startTransition] = useTransition();
	const [animating, setAnimating] = useState(false);

	function handleClick(e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (!user) {
			router.push("/auth/login");
			return;
		}

		const newState = !isFavorite;
		setIsFavorite(newState);
		setAnimating(true);
		setTimeout(() => setAnimating(false), 350);

		startTransition(async () => {
			const result = await toggleFavorite(listingId, newState ? "add" : "remove");
			if (!result.success) {
				setIsFavorite(!newState); // revert
			}
		});
	}

	return (
		<button
			onClick={handleClick}
			disabled={isPending}
			className={cn(
				"flex items-center justify-center shadow-sm transition-all duration-200 active:scale-90",
				showLabel ? "gap-2 rounded-lg px-4 py-2 text-sm font-medium hover:scale-[1.02]" : "h-8 w-8 rounded-full hover:scale-110",
				isFavorite
					? showLabel ? "bg-red-50 text-red-500 border border-red-200" : "bg-red-500 text-white"
					: showLabel ? "bg-white text-[#64748B] border border-[#DBEAFE] hover:text-red-500 hover:border-red-200" : "bg-white/80 text-[#64748B] backdrop-blur-sm hover:bg-white hover:text-red-500",
				animating && "animate-heart-pop",
				className,
			)}
		>
			<Heart className={cn("h-4 w-4 transition-transform", isFavorite && "fill-current")} />
			{showLabel && (isFavorite ? "Saved" : "Save")}
		</button>
	);
}
