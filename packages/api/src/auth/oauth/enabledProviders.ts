import type { OAuthProvider } from "./types";

const PROVIDER_ORDER: OAuthProvider[] = ["google", "apple", "facebook"];

function isOAuthProvider(value: string): value is OAuthProvider {
	return PROVIDER_ORDER.includes(value as OAuthProvider);
}

export function resolveEnabledOAuthProviders(
	configuredProviders: OAuthProvider[],
	enabledInAdmin?: string[],
): OAuthProvider[] {
	const enabledSet = new Set(
		(enabledInAdmin ?? PROVIDER_ORDER).filter(isOAuthProvider),
	);
	const resolved = new Set(
		configuredProviders.filter((provider) => enabledSet.has(provider)),
	);
	const hasNonAppleProvider = [...resolved].some(
		(provider) => provider !== "apple",
	);

	if (hasNonAppleProvider && configuredProviders.includes("apple")) {
		resolved.add("apple");
	}

	return PROVIDER_ORDER.filter(
		(provider) =>
			configuredProviders.includes(provider) && resolved.has(provider),
	);
}
