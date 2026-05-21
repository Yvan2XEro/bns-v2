import config from "@payload-config";
import { getPayload } from "payload";
import { listConfiguredOAuthProviders } from "@/auth/oauth/providers";
import type { OAuthProvider } from "@/auth/oauth/types";

const ALL_PROVIDERS: Array<{ label: string; value: OAuthProvider }> = [
	{ label: "Google", value: "google" },
	{ label: "Apple", value: "apple" },
	{ label: "Facebook", value: "facebook" },
];

function GoogleIcon() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 18 18"
			aria-hidden="true"
			style={{ flexShrink: 0 }}
		>
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
			viewBox="0 0 24 24"
			aria-hidden="true"
			fill="currentColor"
			style={{ flexShrink: 0 }}
		>
			<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
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
			style={{ flexShrink: 0 }}
		>
			<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
		</svg>
	);
}

const ICONS: Record<OAuthProvider, () => React.ReactElement> = {
	google: GoogleIcon,
	apple: AppleIcon,
	facebook: FacebookIcon,
};

async function getEnabledProviders(): Promise<
	Array<{ label: string; value: OAuthProvider }>
> {
	try {
		const payload = await getPayload({ config });
		const settings = await payload.findGlobal({ slug: "app-settings" });
		const authSettings = (
			settings as unknown as { auth?: { enabledProviders?: string[] } }
		)?.auth;
		const enabledInAdmin = authSettings?.enabledProviders ?? [
			"google",
			"apple",
			"facebook",
		];

		const configured = listConfiguredOAuthProviders();
		const enabled = configured.filter((p) => enabledInAdmin.includes(p));
		return ALL_PROVIDERS.filter((p) => enabled.includes(p.value));
	} catch {
		const configured = listConfiguredOAuthProviders();
		return ALL_PROVIDERS.filter((p) =>
			configured.includes(p.value as OAuthProvider),
		);
	}
}

export default async function AdminSocialLogin() {
	const providers = await getEnabledProviders();

	if (providers.length === 0) return null;

	return (
		<div
			style={{
				border: "1px solid rgba(15, 23, 42, 0.08)",
				borderRadius: 16,
				display: "grid",
				gap: 12,
				marginBottom: 20,
				padding: 16,
			}}
		>
			<div style={{ display: "grid", gap: 4 }}>
				<strong style={{ color: "#0f172a", fontSize: 16 }}>
					Continue with a provider
				</strong>
				<p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>
					Sign in with your preferred account. Email / password remains
					available below.
				</p>
			</div>

			<div style={{ display: "grid", gap: 8 }}>
				{providers.map((provider) => {
					const Icon = ICONS[provider.value];
					return (
						<a
							href={`/api/public/auth/oauth/${provider.value}/start?audience=admin&redirectTo=/admin`}
							key={provider.value}
							style={{
								alignItems: "center",
								border: "1px solid #dbe4f0",
								borderRadius: 12,
								color: "#0f172a",
								display: "flex",
								fontSize: 14,
								fontWeight: 600,
								gap: 10,
								justifyContent: "center",
								minHeight: 44,
								textDecoration: "none",
							}}
						>
							<Icon />
							Continue with {provider.label}
						</a>
					);
				})}
			</div>
		</div>
	);
}
