"use client";

import { Button } from "~/components/ui/button";
import { type SocialAuthProvider, useAuth } from "~/hooks/use-auth";

const providers: Array<{ label: string; value: SocialAuthProvider }> = [
	{ label: "Google", value: "google" },
	{ label: "Apple", value: "apple" },
	{ label: "Facebook", value: "facebook" },
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
				{providers.map((provider) => (
					<Button
						className="w-full rounded-xl border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]"
						key={provider.value}
						onClick={() => loginWithProvider(provider.value, redirectTo)}
						type="button"
						variant="outline"
					>
						Continue with {provider.label}
					</Button>
				))}
			</div>
		</div>
	);
}
