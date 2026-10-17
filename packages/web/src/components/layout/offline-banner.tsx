"use client";

import { onlineManager } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

/**
 * A pill at the top of the screen while the browser is offline, like the
 * app's. TanStack Query already pauses requests and refetches on reconnect;
 * this only tells the visitor why nothing moves.
 */
export function OfflineBanner() {
	const t = useTranslations("Common");
	const online = useSyncExternalStore(
		(listener) => onlineManager.subscribe(listener),
		() => onlineManager.isOnline(),
		() => true,
	);
	if (online) return null;
	return (
		<output className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+8px)] z-[1000] flex justify-center px-4">
			<span className="flex items-center gap-1.5 rounded-full bg-[#0F172A] px-3 py-1.5 font-semibold text-white text-xs shadow-lg ring-1 ring-white/15">
				<WifiOff aria-hidden="true" className="h-3.5 w-3.5" />
				{t("offline")}
			</span>
		</output>
	);
}
