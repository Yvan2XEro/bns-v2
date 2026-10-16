"use client";

import { MonitorDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** Chrome and Edge's install prompt event; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isInstallPrompt(event: Event): event is BeforeInstallPromptEvent {
	return "prompt" in event && typeof event.prompt === "function";
}

/**
 * "Install on this computer", next to the store badges: shown only when the
 * browser offers to install the site (Chrome, Edge — not on a phone, where
 * the native app is the one to get, nor once installed).
 */
export function InstallAppButton() {
	const t = useTranslations("AppBanner");
	const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

	useEffect(() => {
		const onPrompt = (event: Event) => {
			if (!isInstallPrompt(event)) return;
			// Phones get the native app instead: keep the browser's own
			// mini-infobar quiet there and offer nothing here.
			event.preventDefault();
			if (window.matchMedia("(pointer: coarse)").matches) return;
			setPrompt(event);
		};
		const onInstalled = () => setPrompt(null);
		window.addEventListener("beforeinstallprompt", onPrompt);
		window.addEventListener("appinstalled", onInstalled);
		return () => {
			window.removeEventListener("beforeinstallprompt", onPrompt);
			window.removeEventListener("appinstalled", onInstalled);
		};
	}, []);

	if (!prompt) return null;

	return (
		<button
			type="button"
			onClick={async () => {
				await prompt.prompt();
				await prompt.userChoice;
				setPrompt(null);
			}}
			className="flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 font-semibold text-ink text-xs transition-colors hover:border-brand hover:text-brand"
		>
			<MonitorDown aria-hidden="true" className="h-4 w-4" />
			{t("installOnComputer")}
		</button>
	);
}
