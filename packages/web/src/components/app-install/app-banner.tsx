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
	storeUrlFor,
} from "~/lib/app-stores";

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
 * On a phone's browser, a slim bar at the top of the page inviting to the
 * native app — the Play Store on Android, the App Store on iOS browsers other
 * than Safari (Safari shows Apple's own Smart App Banner from the
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
				href={storeUrlFor(platform)}
				target="_blank"
				rel="noopener noreferrer"
				className="shrink-0 rounded-full bg-brand-fill px-4 py-1.5 font-bold text-white text-xs hover:bg-brand-strong"
			>
				{t("open")}
			</a>
		</div>
	);
}
