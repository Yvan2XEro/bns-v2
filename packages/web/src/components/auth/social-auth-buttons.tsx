"use client";

import type React from "react";
import { Button } from "~/components/ui/button";
import { type SocialAuthProvider, useAuth } from "~/hooks/use-auth";

function GoogleIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
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
			width="18"
			height="18"
			viewBox="0 0 814 1000"
			aria-hidden="true"
			fill="currentColor"
		>
			<path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 484 0 367.5 0 255.8c0-207.1 135.5-316.5 269.4-316.5 71 0 130.1 47.3 173.8 47.3 41.5 0 106.5-50.4 188.6-50.4zm-174 -150.8c-11.2 47.5-41.5 95.3-74.1 124.9-33.9 30.8-82.5 54.3-131.1 54.3-5.8 0-11.5-.6-17.4-1.3 0-50.4 33.3-101.5 63-134.2 31.5-35.3 81.7-61.6 124.9-62.8 1.3 6.5 1.3 13 1.3 19.1z" />
		</svg>
	);
}

function FacebookIcon() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 24 24"
			aria-hidden="true"
			fill="#1877F2"
		>
			<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
		</svg>
	);
}

const providers: Array<{
	label: string;
	value: SocialAuthProvider;
	Icon: () => React.ReactElement;
}> = [
	{ label: "Google", value: "google", Icon: GoogleIcon },
	{ label: "Apple", value: "apple", Icon: AppleIcon },
	{ label: "Facebook", value: "facebook", Icon: FacebookIcon },
];

export function SocialAuthButtons({
	redirectTo = "/",
}: {
	redirectTo?: string;
}) {
	const { loginWithProvider } = useAuth();

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-3">
				<div className="h-px flex-1 bg-[#E2E8F0]" />
				<span className="text-[#64748B] text-xs uppercase tracking-[0.18em]">
					Or continue with
				</span>
				<div className="h-px flex-1 bg-[#E2E8F0]" />
			</div>

			<div className="grid gap-2">
				{providers.map(({ label, value, Icon }) => (
					<Button
						className="w-full justify-start gap-3 rounded-xl border-[#E2E8F0] bg-white px-4 text-[#0F172A] hover:bg-[#F8FAFC]"
						key={value}
						onClick={() => loginWithProvider(value, redirectTo)}
						type="button"
						variant="outline"
					>
						<Icon />
						Continue with {label}
					</Button>
				))}
			</div>
		</div>
	);
}
