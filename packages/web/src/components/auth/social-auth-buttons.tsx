"use client";

import { useTranslations } from "next-intl";
import type React from "react";
import { useEffect, useState } from "react";
import { type SocialAuthProvider, useAuth } from "~/hooks/use-auth";
import { orderedProviders, SOCIAL_PROVIDER_ORDER } from "~/lib/auth-form";
import { cn } from "~/lib/utils";

function GoogleIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
			<path
				d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
				fill="#4285F4"
			/>
			<path
				d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
				fill="#34A853"
			/>
			<path
				d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
				fill="#FBBC05"
			/>
			<path
				d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"
				fill="#EA4335"
			/>
		</svg>
	);
}

function AppleIcon() {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			aria-hidden="true"
			fill="currentColor"
		>
			<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
		</svg>
	);
}

function FacebookIcon() {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			aria-hidden="true"
			fill="currentColor"
		>
			<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
		</svg>
	);
}

// Each mark on its own brand surface: Google's white button with the
// four-colour G, Apple's black, Facebook's blue with the white "f".
const PROVIDERS: Record<
	SocialAuthProvider,
	{ label: string; Icon: () => React.ReactElement; className: string }
> = {
	google: {
		label: "Google",
		Icon: GoogleIcon,
		className:
			"border border-[#747775] bg-white text-[#1F1F1F] hover:bg-[#F8FAFC] focus-visible:ring-brand dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3] dark:hover:bg-[#1F1F1F]",
	},
	apple: {
		label: "Apple",
		Icon: AppleIcon,
		className:
			"border border-black bg-black text-white hover:bg-[#1F1F1F] focus-visible:ring-brand dark:border-white dark:bg-white dark:text-black dark:hover:bg-[#E5E5E5]",
	},
	facebook: {
		label: "Facebook",
		Icon: FacebookIcon,
		className:
			"border border-[#1877F2] bg-[#1877F2] text-white hover:bg-[#166FE5] focus-visible:ring-brand",
	},
};

/**
 * Providers the API has enabled, in display order. `null` while loading; a
 * failed lookup falls back to all three, as before.
 */
const PROVIDERS_CACHE = "bns.auth.providers";

export function useSocialProviders(): SocialAuthProvider[] | null {
	const [providers, setProviders] = useState<SocialAuthProvider[] | null>(null);
	useEffect(() => {
		// The last answer is shown at once, so a return visit never reshapes the card.
		try {
			const cached = localStorage.getItem(PROVIDERS_CACHE);
			const parsed: unknown = cached ? JSON.parse(cached) : null;
			if (Array.isArray(parsed)) setProviders(orderedProviders(parsed));
		} catch {
			// No storage (private mode): the skeleton shows until the answer.
		}
		fetch("/api/public/auth/providers")
			.then((r) => r.json())
			.then((data: { providers: string[] }) => {
				const list = orderedProviders(data.providers ?? []);
				setProviders(list);
				try {
					localStorage.setItem(PROVIDERS_CACHE, JSON.stringify(list));
				} catch {
					// Not cached; the next visit shows the skeleton again.
				}
			})
			.catch(() =>
				setProviders((current) => current ?? [...SOCIAL_PROVIDER_ORDER]),
			);
	}, []);
	return providers;
}

/** The SSO button's wording and icon, from the API. */
export interface SsoOption {
	label: string;
	icon: string;
}

/** The `?sso=` values that show Overbrand's single sign-on on the sign-in. */
const SSO_PARAM_VALUES = new Set(["overbrand", "ob"]);

/** Whether the sign-in page was opened asking for the SSO button. */
export function ssoRequested(value: string | null): boolean {
	return value !== null && SSO_PARAM_VALUES.has(value.trim().toLowerCase());
}

/**
 * Overbrand's single sign-on, for system administrators: asked for only when
 * the sign-in page is opened with `?sso=overbrand` (or `?sso=ob`), so the
 * public never sees it; null when not asked for, or while the SSO is off.
 * Hiding it is only tidiness: the role at Overbrand and the administrator
 * account decide.
 */
export function useSsoOption(requested: boolean): SsoOption | null {
	const [option, setOption] = useState<SsoOption | null>(null);
	useEffect(() => {
		if (!requested) return;
		fetch("/api/public/auth/sso/button")
			.then((r) => (r.ok ? r.json() : null))
			.then((data: (SsoOption & { enabled: boolean }) | null) => {
				if (data?.enabled) setOption({ label: data.label, icon: data.icon });
			})
			.catch(() => undefined);
	}, [requested]);
	return option;
}

const BUTTON_CLASS =
	"flex h-12 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-2xl px-4 font-medium text-sm shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]";

export function SocialAuthButtons({
	providers,
	redirectTo = "/",
	sso = null,
}: {
	providers: SocialAuthProvider[] | null;
	redirectTo?: string;
	sso?: SsoOption | null;
}) {
	const t = useTranslations("Auth");
	const { loginWithProvider, loginWithSso } = useAuth();

	if (providers === null)
		return (
			<div className="grid gap-3" aria-hidden="true">
				{SOCIAL_PROVIDER_ORDER.map((p) => (
					<div key={p} className="h-12 animate-pulse rounded-2xl bg-subtle" />
				))}
			</div>
		);

	return (
		<ul className="grid gap-3">
			{providers.map((value) => {
				const { label, Icon, className } = PROVIDERS[value];
				return (
					<li key={value}>
						<button
							type="button"
							onClick={() => loginWithProvider(value, redirectTo)}
							className={cn(BUTTON_CLASS, className)}
						>
							<Icon />
							{t("continueWith", { provider: label })}
						</button>
					</li>
				);
			})}
			{sso ? (
				<li>
					<button
						type="button"
						onClick={() => loginWithSso(redirectTo)}
						className={cn(
							BUTTON_CLASS,
							"border border-line bg-surface text-ink hover:bg-subtle focus-visible:ring-brand",
						)}
					>
						{/* biome-ignore lint/performance/noImgElement: a small mark served by the API, behind a redirect next/image cannot follow */}
						<img src={sso.icon} alt="" width={20} height={20} />
						{t("continueWith", { provider: sso.label })}
					</button>
				</li>
			) : null}
		</ul>
	);
}
