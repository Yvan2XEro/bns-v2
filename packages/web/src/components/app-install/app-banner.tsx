"use client";

import { X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
	bannerSnoozed,
	isIosSafari,
	type MobilePlatform,
	mobilePlatformOf,
	openInAppLink,
} from "~/lib/app-stores";

/** How long iOS gets to switch to the app before the App Store is offered. */
const IOS_FALLBACK_MS = 1500;

const DISMISSED_KEY = "bns.appBannerDismissedAt";

function readDismissedAt(): number | null {
	try {
		const raw = window.localStorage.getItem(DISMISSED_KEY);
		const value = raw ? Number(raw) : Number.NaN;
		return Number.isFinite(value) ? value : null;
	} catch {
		return null;
	}
}

function isStandalone(): boolean {
	return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

/**
 * On a phone's browser, a slim bar at the top of the page offering to open
 * this same page in the native app — which opens it when installed, and the
 * store otherwise (Safari shows Apple's own Smart App Banner from the
 * `apple-itunes-app` tag instead, never both). Closed, it stays away 30 days.
 * Never on a computer, where the site itself installs.
 */
export function AppBanner() {
	const t = useTranslations("AppBanner");
	const [platform, setPlatform] = useState<MobilePlatform | null>(null);

	useEffect(() => {
		const ua = navigator.userAgent;
		const detected = mobilePlatformOf(ua);
		if (!detected || isIosSafari(ua) || isStandalone()) return;
		if (bannerSnoozed(readDismissedAt(), Date.now())) return;
		setPlatform(detected);
	}, []);

	if (!platform) return null;

	const open = (event: React.MouseEvent<HTMLAnchorElement>) => {
		const { href, fallback } = openInAppLink(
			platform,
			window.location.pathname,
			window.location.search,
		);
		event.preventDefault();
		window.location.href = href;
		if (!fallback) return;
		// iOS gives no answer when no app takes the link: still on this page a
		// moment later means it is not installed.
		const timer = window.setTimeout(() => {
			if (document.visibilityState === "visible")
				window.location.href = fallback;
		}, IOS_FALLBACK_MS);
		const cancel = () => {
			if (document.visibilityState === "hidden") window.clearTimeout(timer);
		};
		document.addEventListener("visibilitychange", cancel, { once: true });
	};

	const dismiss = () => {
		try {
			window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
		} catch {
			// Storage blocked: closed for this page only.
		}
		setPlatform(null);
	};

	return (
		<div className="flex items-center gap-3 border-line border-b bg-surface px-3 py-2 md:hidden">
			<button
				type="button"
				onClick={dismiss}
				aria-label={t("close")}
				className="-ml-1 rounded-full p-1.5 text-ink-faint hover:bg-subtle hover:text-ink-mid"
			>
				<X aria-hidden="true" className="h-4 w-4" />
			</button>
			<Image
				src="/icons/icon-192.png"
				alt=""
				width={40}
				height={40}
				className="h-10 w-10 shrink-0 rounded-[10px] border border-line"
			/>
			<div className="min-w-0 flex-1 leading-tight">
				<p className="truncate font-bold text-ink text-sm">{t("title")}</p>
				<p className="truncate text-ink-muted text-xs">{t("subtitle")}</p>
			</div>
			<a
				href={openInAppLink(platform, "/", "").href}
				onClick={open}
				className="shrink-0 rounded-full bg-brand-fill px-4 py-1.5 font-bold text-white text-xs hover:bg-brand-strong"
			>
				{t("open")}
			</a>
		</div>
	);
}
