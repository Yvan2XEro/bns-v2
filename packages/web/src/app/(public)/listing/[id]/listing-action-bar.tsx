"use client";

import {
	Briefcase,
	CalendarCheck,
	FileText,
	type LucideIcon,
	MessageCircle,
	ShoppingBag,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { ListingAction } from "~/lib/listing-kind";

const ICONS: Record<ListingAction, LucideIcon> = {
	order: ShoppingBag,
	contact: MessageCircle,
	visit: CalendarCheck,
	apply: Briefcase,
	quote: FileText,
};

/**
 * On a phone the buy box and the seller card sit below the photos and the
 * description: this bar keeps the price and the main action in reach, and
 * steps aside while the section it leads to is on screen.
 */
export function ListingActionBar({
	price,
	action,
	targetId,
}: {
	price: string | null;
	action: ListingAction;
	targetId: string;
}) {
	const t = useTranslations("Listing");
	const tKind = useTranslations("ListingKind");
	const [targetVisible, setTargetVisible] = useState(false);

	useEffect(() => {
		const target = document.getElementById(targetId);
		if (!target || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(([entry]) =>
			setTargetVisible(Boolean(entry?.isIntersecting)),
		);
		observer.observe(target);
		return () => observer.disconnect();
	}, [targetId]);

	function reveal() {
		const target = document.getElementById(targetId);
		if (!target) return;
		target.scrollIntoView({ behavior: "smooth", block: "center" });
		target
			.querySelector<HTMLElement>("button:not([disabled]), a[href]")
			?.focus({ preventScroll: true });
	}

	const Icon = ICONS[action];

	return (
		<>
			{/* Keeps the end of the page clear of the bar. */}
			<div aria-hidden className="h-20 lg:hidden" />
			<div
				className={`fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-line border-t bg-surface/95 px-4 py-3 backdrop-blur transition-transform md:bottom-0 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden ${
					targetVisible ? "translate-y-[150%]" : ""
				}`}
				aria-hidden={targetVisible}
				inert={targetVisible}
			>
				<div className="mx-auto flex max-w-2xl items-center gap-3">
					{price && (
						<p className="min-w-0 flex-1 truncate font-bold text-brand text-lg">
							{price}
						</p>
					)}
					<button
						type="button"
						onClick={reveal}
						className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-fill px-5 font-bold text-white hover:bg-brand-strong"
					>
						<Icon aria-hidden className="h-[18px] w-[18px]" />
						{action === "order"
							? t("barOrder")
							: action === "contact"
								? t("barContact")
								: tKind(`action.${action}`)}
					</button>
				</div>
			</div>
		</>
	);
}
