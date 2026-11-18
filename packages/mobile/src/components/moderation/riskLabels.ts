import type { Translate } from "./theme";

/**
 * The words a moderator reads for a risk signal or a piece of evidence.
 *
 * The API speaks in machine keys ("velocity.orders_per_phone", "deviceCount").
 * Each one is looked up under `moderation.riskSignal_*` / `riskEvidence_*`;
 * a key the locale files do not know yet still reads as words, never as a
 * dotted identifier.
 */

function readable(key: string): string {
	const words = key
		.replaceAll(".", " · ")
		.replaceAll("_", " ")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

export function riskSignalLabel(signal: string, t: Translate): string {
	return t(`moderation.riskSignal_${signal.replaceAll(".", "_")}`, {
		defaultValue: readable(signal),
	});
}

/**
 * The detail route sends evidence labels already turned into English
 * sentence case ("Device count"). Folding the label back to its camelCase
 * key ("deviceCount") lets the locale files name it; the English label is the
 * fallback until the API sends the key itself.
 */
export function riskEvidenceLabel(label: string, t: Translate): string {
	const key = label
		.trim()
		.split(/\s+/)
		.map((word, index) =>
			index === 0
				? word.toLowerCase()
				: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
		)
		.join("");
	if (!key) return label;
	return t(`moderation.riskEvidence_${key}`, { defaultValue: label });
}
