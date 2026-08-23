/**
 * Guesses the category of an ad from the title the seller typed.
 *
 * The ad form asks for the title first and pre-selects a category from it, the
 * way leboncoin does. There is no model behind this: it scores the title's
 * words against a corpus we already ship — the category name, its search
 * aliases, its attribute names and the values those attributes offer.
 *
 * A guess is only returned when it is both strong enough on its own and clearly
 * ahead of the runner-up; below either bar the caller gets `null` and asks the
 * question rather than answering it badly. A category the seller did not notice
 * being wrong buries their ad where no buyer looks.
 *
 * ── Keep in sync ──────────────────────────────────────────────────────────
 * The block between the SHARED CORE markers is duplicated verbatim from
 * `packages/mobile/src/lib/categorySuggest.ts`, which is where it is
 * documented in full and where its tests live. Those tests fail if the two
 * copies drift: web and mobile scoring the same title differently would be a
 * bug no one would think to look for.
 */

// ─── SHARED CORE — keep byte-identical with the web twin ───────────────────

/** The shape both apps' category objects satisfy, and nothing more. */
export interface SuggestibleCategory {
	id?: unknown;
	name?: unknown;
	description?: unknown;
	searchAliases?: unknown;
	parent?: unknown;
	attributes?: unknown;
}

export interface CategorySuggestion<T> {
	category: T;
	score: number;
}

/**
 * How much a title word is worth per place it was found. A word is scored once,
 * by its best source: categories differ wildly in how many attributes they
 * define (Cars has 23, Gaming has 8), and summing every hit would rank the
 * verbose category above the right one.
 */
const WEIGHTS = {
	alias: 10,
	name: 8,
	optionValue: 4,
	attributeName: 3,
	description: 2,
} as const;

/**
 * A multi-word alias found in the title is the strongest signal available —
 * "machine a laver" or "offre d emploi" cannot be a coincidence the way a
 * single word can.
 */
const PHRASE_WEIGHT = 14;

/**
 * A child category always describes the ad better than its parent: Cars asks 23
 * questions, Vehicles asks 5. They share most of their vocabulary, so without
 * this the seller is regularly handed the emptier form.
 */
const LEAF_BONUS = 1.2;

/** Below this, the match rests on a stray word and is not worth offering. */
const MIN_SCORE = 8;

/** The winner must be this far ahead, or the title is genuinely ambiguous. */
const MARGIN = 1.25;

/**
 * Words that appear in every other ad title and point at no category. Dropping
 * them keeps "Vends voiture urgent bon etat" from scoring on "vends".
 */
const STOPWORDS = new Set([
	// French
	"a",
	"au",
	"aux",
	"avec",
	"ce",
	"ces",
	"cet",
	"cette",
	"dans",
	"de",
	"des",
	"du",
	"en",
	"et",
	"est",
	"la",
	"le",
	"les",
	"leur",
	"lui",
	"ma",
	"mes",
	"mon",
	"ne",
	"nos",
	"notre",
	"nous",
	"on",
	"ou",
	"par",
	"pas",
	"pour",
	"sa",
	"se",
	"ses",
	"son",
	"sur",
	"ta",
	"tes",
	"ton",
	"tres",
	"un",
	"une",
	"vos",
	"votre",
	"vous",
	"y",
	// Ad boilerplate: true of half the listings, indicative of nothing
	"achat",
	"bon",
	"cause",
	"cede",
	"etat",
	"excellent",
	"neuf",
	"neuve",
	"occasion",
	"offre",
	"parfait",
	"promo",
	"promotion",
	"rapide",
	"super",
	"urgent",
	"vend",
	"vendre",
	"vends",
	"vente",
	// English
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"but",
	"by",
	"for",
	"from",
	"has",
	"have",
	"in",
	"is",
	"it",
	"its",
	"of",
	"off",
	"on",
	"or",
	"our",
	"that",
	"the",
	"their",
	"this",
	"to",
	"was",
	"were",
	"will",
	"with",
	"your",
	"brand",
	"cheap",
	"condition",
	"excellent",
	"good",
	"great",
	"new",
	"price",
	"sale",
	"sell",
	"selling",
	"used",
]);

/**
 * Accent folding by table rather than `String.prototype.normalize`: Hermes does
 * not guarantee full Unicode normalisation, and this runs on every keystroke.
 */
const FOLD: Record<string, string> = {
	à: "a",
	á: "a",
	â: "a",
	ã: "a",
	ä: "a",
	å: "a",
	ç: "c",
	è: "e",
	é: "e",
	ê: "e",
	ë: "e",
	ì: "i",
	í: "i",
	î: "i",
	ï: "i",
	ñ: "n",
	ò: "o",
	ó: "o",
	ô: "o",
	õ: "o",
	ö: "o",
	ø: "o",
	ù: "u",
	ú: "u",
	û: "u",
	ü: "u",
	ý: "y",
	ÿ: "y",
	æ: "ae",
	œ: "oe",
	ß: "ss",
};

/** Lowercased, unaccented, punctuation reduced to single spaces. */
export function normalizeText(input: unknown): string {
	if (typeof input !== "string" || input.length === 0) return "";

	let folded = "";
	for (const char of input.toLowerCase()) {
		folded += FOLD[char] ?? char;
	}

	return folded.replace(/[^a-z0-9]+/g, " ").trim();
}

/** Meaningful words of a title, deduplicated so repetition cannot inflate. */
export function tokenize(input: unknown): string[] {
	const normalized = normalizeText(input);
	if (!normalized) return [];

	const seen = new Set<string>();
	for (const word of normalized.split(" ")) {
		// One-character words are noise ("a", "l", model numbers already split off).
		if (word.length < 2) continue;
		if (STOPWORDS.has(word)) continue;
		seen.add(word);
	}

	return [...seen];
}

/** Every option value an attribute offers, whatever shape it arrived in. */
function optionValues(attribute: unknown): string[] {
	const options = (attribute as { options?: unknown })?.options;
	if (!Array.isArray(options)) return [];

	const values: string[] = [];
	for (const option of options) {
		if (typeof option === "string") values.push(option);
		else if (typeof (option as { value?: unknown })?.value === "string") {
			values.push((option as { value: string }).value);
		}
	}
	return values;
}

function idOf(category: SuggestibleCategory): string {
	return typeof category.id === "string" ? category.id : "";
}

/**
 * `parent` arrives either populated or as a bare id, depending on the depth the
 * caller asked for; both mean the same thing here.
 */
function parentIdOf(category: SuggestibleCategory): string {
	const parent = category.parent;
	if (typeof parent === "string") return parent;
	const nested = (parent as { id?: unknown } | null)?.id;
	return typeof nested === "string" ? nested : "";
}

/**
 * A category and its own parent are not two answers to the same question — the
 * child is the more precise one, and by design they share most of their
 * vocabulary ("voiture" belongs to both Vehicles and Cars). Only unrelated
 * categories make a title genuinely ambiguous, so only they count as rivals.
 */
function areRelated(a: SuggestibleCategory, b: SuggestibleCategory): boolean {
	const aId = idOf(a);
	const bId = idOf(b);
	if (aId && aId === bId) return true;
	if (aId && parentIdOf(b) === aId) return true;
	if (bId && parentIdOf(a) === bId) return true;
	return false;
}

interface CategoryCorpus {
	aliasWords: Set<string>;
	aliasPhrases: string[];
	nameWords: Set<string>;
	optionWords: Set<string>;
	attributeWords: Set<string>;
	descriptionWords: Set<string>;
	isLeaf: boolean;
}

function addWords(target: Set<string>, source: unknown): void {
	for (const word of tokenize(source)) target.add(word);
}

/**
 * Flattens one category into the word sets the scorer needs. Callers should
 * memoise the result: it depends only on the category list, which changes once
 * a session, while scoring runs on every keystroke.
 */
export function buildCorpus(category: SuggestibleCategory): CategoryCorpus {
	const aliasWords = new Set<string>();
	const aliasPhrases: string[] = [];

	const rawAliases =
		typeof category.searchAliases === "string" ? category.searchAliases : "";
	for (const entry of rawAliases.split(",")) {
		const alias = normalizeText(entry);
		if (!alias) continue;
		// A multi-word alias is matched as a phrase; a single word joins the pool.
		if (alias.includes(" ")) aliasPhrases.push(alias);
		else if (alias.length >= 2) aliasWords.add(alias);
	}

	const nameWords = new Set<string>();
	addWords(nameWords, category.name);

	const descriptionWords = new Set<string>();
	addWords(descriptionWords, category.description);

	const optionWords = new Set<string>();
	const attributeWords = new Set<string>();
	if (Array.isArray(category.attributes)) {
		for (const attribute of category.attributes) {
			addWords(attributeWords, (attribute as { name?: unknown })?.name);
			for (const value of optionValues(attribute)) {
				addWords(optionWords, value);
			}
		}
	}

	const isLeaf = parentIdOf(category).length > 0;

	return {
		aliasWords,
		aliasPhrases,
		nameWords,
		optionWords,
		attributeWords,
		descriptionWords,
		isLeaf,
	};
}

/** Scores one title against one category's corpus. Zero means no evidence. */
export function scoreCorpus(corpus: CategoryCorpus, title: string): number {
	const words = tokenize(title);
	if (words.length === 0) return 0;

	let score = 0;

	for (const word of words) {
		let best = 0;
		if (corpus.aliasWords.has(word)) best = WEIGHTS.alias;
		else if (corpus.nameWords.has(word)) best = WEIGHTS.name;
		else if (corpus.optionWords.has(word)) best = WEIGHTS.optionValue;
		else if (corpus.attributeWords.has(word)) best = WEIGHTS.attributeName;
		else if (corpus.descriptionWords.has(word)) best = WEIGHTS.description;
		score += best;
	}

	// Phrases are checked against the whole title, not its word set, so word
	// order still has to line up.
	if (corpus.aliasPhrases.length > 0) {
		const haystack = ` ${normalizeText(title)} `;
		for (const phrase of corpus.aliasPhrases) {
			if (haystack.includes(` ${phrase} `)) score += PHRASE_WEIGHT;
		}
	}

	if (score > 0 && corpus.isLeaf) score *= LEAF_BONUS;

	return score;
}

/**
 * The best category for this title, or `null` when the title says too little or
 * points at two categories equally well.
 *
 * `corpusFor` is passed in so the caller owns the memoisation — rebuilding 31
 * corpora on every keystroke would be wasteful, and the category list is the
 * only thing they depend on.
 */
export function suggestCategory<T extends SuggestibleCategory>(
	categories: T[],
	title: string,
	corpusFor: (category: T) => CategoryCorpus,
): CategorySuggestion<T> | null {
	if (tokenize(title).length === 0) return null;

	const scored: CategorySuggestion<T>[] = [];
	for (const category of categories) {
		if (!category) continue;
		const score = scoreCorpus(corpusFor(category), title);
		if (score > 0) scored.push({ category, score });
	}

	if (scored.length === 0) return null;
	scored.sort((a, b) => b.score - a.score);

	const best = scored[0];
	if (best.score < MIN_SCORE) return null;

	// Two unrelated categories fitting equally well is not a near-miss to be
	// broken by array order — it means the title does not say which one it is.
	const rival = scored.find(
		(entry) => entry !== best && !areRelated(entry.category, best.category),
	);
	if (rival && best.score < rival.score * MARGIN) return null;

	return best;
}

// ─── END SHARED CORE ───────────────────────────────────────────────────────

/**
 * Wraps `suggestCategory` with a cache keyed on the category objects, so the
 * corpora survive across keystrokes but are rebuilt when the list reloads.
 */
export function createCategorySuggester<T extends SuggestibleCategory>(
	categories: T[],
): (title: string) => CategorySuggestion<T> | null {
	const cache = new Map<T, CategoryCorpus>();

	const corpusFor = (category: T): CategoryCorpus => {
		const cached = cache.get(category);
		if (cached) return cached;
		const built = buildCorpus(category);
		cache.set(category, built);
		return built;
	};

	return (title: string) => suggestCategory(categories, title, corpusFor);
}
