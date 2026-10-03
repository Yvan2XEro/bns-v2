/**
 * Decides whether the name a seller typed for a payout account matches the
 * seller's verified identity. See the P5 spec for the verdict rules; this
 * module only implements them, with no provider or collection access.
 */

export type NameMatchVerdict = "match" | "partial" | "mismatch";

export interface NameMatchInput {
	candidate: string;
	identityName: string;
	businessName?: string;
	providerName?: string;
}

export interface NameMatchResult {
	result: NameMatchVerdict;
	score: number;
}

const JARO_WINKLER_MATCH_THRESHOLD = 0.92;
const WINKLER_PREFIX_SCALE = 0.1;
const WINKLER_MAX_PREFIX = 4;

function tokenize(name: string): string[] {
	return name
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
}

/** NFKD, diacritics stripped, upper-cased, punctuation stripped, tokens sorted. */
export function normalizeName(name: string): string {
	return tokenize(name).sort().join(" ");
}

function jaro(a: string, b: string): number {
	if (a === b) return 1;
	const len1 = a.length;
	const len2 = b.length;
	if (len1 === 0 || len2 === 0) return 0;

	const matchDistance = Math.max(
		0,
		Math.floor(Math.max(len1, len2) / 2) - 1,
	);
	const aMatches = new Array<boolean>(len1).fill(false);
	const bMatches = new Array<boolean>(len2).fill(false);
	let matches = 0;

	for (let i = 0; i < len1; i++) {
		const start = Math.max(0, i - matchDistance);
		const end = Math.min(i + matchDistance + 1, len2);
		for (let j = start; j < end; j++) {
			if (bMatches[j] || a[i] !== b[j]) continue;
			aMatches[i] = true;
			bMatches[j] = true;
			matches++;
			break;
		}
	}
	if (matches === 0) return 0;

	let transpositions = 0;
	let k = 0;
	for (let i = 0; i < len1; i++) {
		if (!aMatches[i]) continue;
		while (!bMatches[k]) k++;
		if (a[i] !== b[k]) transpositions++;
		k++;
	}
	transpositions = transpositions / 2;

	return (
		(matches / len1 + matches / len2 + (matches - transpositions) / matches) /
		3
	);
}

function commonPrefixLength(a: string, b: string, max: number): number {
	let n = 0;
	while (n < max && n < a.length && n < b.length && a[n] === b[n]) n++;
	return n;
}

/** Jaro-Winkler similarity, 0..1. Implemented here — no new dependency. */
export function jaroWinkler(a: string, b: string): number {
	const jaroScore = jaro(a, b);
	const prefixLength = commonPrefixLength(a, b, WINKLER_MAX_PREFIX);
	return jaroScore + prefixLength * WINKLER_PREFIX_SCALE * (1 - jaroScore);
}

function tokensContained(shorter: string[], longer: string[]): boolean {
	return shorter.every((token) => longer.includes(token));
}

function sharesToken(a: string[], b: string[]): boolean {
	return a.some((token) => b.includes(token));
}

function compare(a: string, b: string): NameMatchResult {
	const tokensA = tokenize(a);
	const tokensB = tokenize(b);
	if (tokensA.length === 0 || tokensB.length === 0) {
		return { result: "mismatch", score: 0 };
	}

	const score = jaroWinkler(normalizeName(a), normalizeName(b));
	const [shorter, longer] =
		tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];

	// The ≥2-token floor gates both routes: a single-token name can never
	// reach "match", however high the Jaro-Winkler score on its own.
	if (shorter.length >= 2) {
		if (tokensContained(shorter, longer) || score >= JARO_WINKLER_MATCH_THRESHOLD) {
			return { result: "match", score };
		}
	}

	if (sharesToken(tokensA, tokensB)) {
		return { result: "partial", score };
	}
	return { result: "mismatch", score };
}

const VERDICT_RANK: Record<NameMatchVerdict, number> = {
	mismatch: 0,
	partial: 1,
	match: 2,
};

/**
 * `providerName` represents the name the payment provider has on file for
 * the account; it never activates a payout by itself, but when present and
 * disagreeing it caps an otherwise-matching typed/identity name at
 * "partial" — the typed name alone never activates.
 */
export function nameMatch(input: NameMatchInput): NameMatchResult {
	let best = compare(input.candidate, input.identityName);
	if (input.businessName) {
		const businessResult = compare(input.candidate, input.businessName);
		if (VERDICT_RANK[businessResult.result] > VERDICT_RANK[best.result]) {
			best = businessResult;
		}
	}

	if (input.providerName && best.result === "match") {
		const providerResult = compare(input.candidate, input.providerName);
		if (providerResult.result !== "match") {
			return { result: "partial", score: best.score };
		}
	}

	return best;
}
