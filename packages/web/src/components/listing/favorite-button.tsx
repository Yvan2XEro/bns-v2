"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useAuth } from "~/hooks/use-auth";
import { toggleFavorite } from "~/lib/actions";
import { cn } from "~/lib/utils";

interface FavoriteButtonProps {
	listingId: string;
	initialFavorite?: boolean;
	className?: string;
	showLabel?: boolean;
}

export function FavoriteButton({
	listingId,
	initialFavorite = false,
	className,
	showLabel = false,
}: FavoriteButtonProps) {
	const t = useTranslations("Favorites");
	const { user } = useAuth();
	const router = useRouter();
	const [isFavorite, setIsFavorite] = useState(initialFavorite);
	const [isPending, startTransition] = useTransition();
	const [animating, setAnimating] = useState(false);
	const [failed, setFailed] = useState(false);

	function handleClick(e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (!user) {
			// Back to this page after signing in, not to the home.
			const here = `${window.location.pathname}${window.location.search}`;
			router.push(`/auth/login?redirect=${encodeURIComponent(here)}`);
			return;
		}

		const newState = !isFavorite;
		setIsFavorite(newState);
		setAnimating(true);
		setTimeout(() => setAnimating(false), 350);

		startTransition(async () => {
			const result = await toggleFavorite(
				listingId,
				newState ? "add" : "remove",
			);
			if (!result.success) {
				setIsFavorite(!newState);
				setFailed(true);
				setTimeout(() => setFailed(false), 3000);
			}
		});
	}

	return (
		<span className={cn("relative", showLabel ? "flex" : "inline-flex")}>
			<button
				type="button"
				onClick={handleClick}
				disabled={isPending}
				aria-pressed={isFavorite}
				aria-label={showLabel ? undefined : isFavorite ? t("saved") : t("save")}
				className={cn(
					"flex items-center justify-center shadow-sm transition-all duration-200 active:scale-90",
					showLabel
						? "gap-2 rounded-lg px-4 py-2 font-medium text-sm hover:scale-[1.02]"
						: "h-10 w-10 rounded-full hover:scale-110",
					isFavorite
						? showLabel
							? "border border-red-200 bg-red-50 text-red-500"
							: "bg-red-500 text-white"
						: showLabel
							? "border border-brand-tint bg-surface text-ink-muted hover:border-red-200 hover:text-red-500"
							: "bg-surface/80 text-ink-muted backdrop-blur-sm hover:bg-surface hover:text-red-500",
					animating && "animate-heart-pop",
					className,
				)}
			>
				<Heart
					aria-hidden
					className={cn(
						"h-4 w-4 transition-transform",
						isFavorite && "fill-current",
					)}
				/>
				{showLabel && (isFavorite ? t("saved") : t("save"))}
			</button>
			{failed && (
				<output className="absolute top-full right-0 z-10 mt-1 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-surface text-xs">
					{t("saveFailed")}
				</output>
			)}
		</span>
	);
}
