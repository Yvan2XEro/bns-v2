/**
 * Deep-link builders for a shop's public contact actions. Both return `null`
 * when the underlying value is empty, so a screen can hide the corresponding
 * button instead of opening a dead `tel:`/`wa.me` link.
 */

export function whatsappLink(
	whatsapp: string | null | undefined,
): string | null {
	const digits = (whatsapp ?? "").replace(/\D/g, "");
	return digits ? `https://wa.me/${digits}` : null;
}

export function telLink(phone: string | null | undefined): string | null {
	const trimmed = (phone ?? "").replace(/\s/g, "");
	return trimmed ? `tel:${trimmed}` : null;
}
