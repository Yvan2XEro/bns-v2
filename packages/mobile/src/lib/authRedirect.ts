export function getSafeAuthRedirect(
	redirect?: string | string[] | null,
): string {
	const value = Array.isArray(redirect) ? redirect[0] : redirect;

	if (!value || !value.startsWith("/") || value.startsWith("//")) {
		return "/(tabs)";
	}

	if (value.startsWith("/auth")) {
		return "/(tabs)";
	}

	return value;
}

export function getAuthModalParams(pathname?: string | null): {
	redirect?: string;
} {
	if (!pathname || !pathname.startsWith("/") || pathname.startsWith("/auth")) {
		return {};
	}

	return { redirect: pathname };
}
