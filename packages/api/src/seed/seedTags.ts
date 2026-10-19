import type { Payload } from "payload";

interface TagData {
	/** Both languages; French is the default locale English falls back to. */
	name: { fr: string; en: string };
	slug: string;
	emoji: string;
	/**
	 * Category slugs the tag is offered in; their subcategories inherit it.
	 * Leisure is listed by child so holiday rentals never get "delivery".
	 */
	categories: string[];
}

export const TAG_DEFINITIONS: TagData[] = [
	// ── Transaction ────────────────────────────────────────────
	{
		name: { fr: "Négociable", en: "Negotiable" },
		slug: "negotiable",
		categories: [
			"vehicles",
			"real-estate",
			"electronics",
			"home-garden",
			"fashion",
			"leisure-sports",
			"kids-baby",
			"other",
		],
		emoji: "🤝",
	},
	{
		name: { fr: "Échange possible", en: "Swap possible" },
		slug: "swap",
		categories: [
			"vehicles",
			"electronics",
			"home-garden",
			"fashion",
			"sports-equipment",
			"books-media",
			"kids-baby",
		],
		emoji: "🔄",
	},
	{
		name: { fr: "Livraison disponible", en: "Delivery available" },
		slug: "delivery",
		categories: [
			"electronics",
			"home-garden",
			"fashion",
			"sports-equipment",
			"books-media",
			"kids-baby",
		],
		emoji: "🚚",
	},
	{
		name: { fr: "Vente urgente", en: "Urgent sale" },
		slug: "urgent",
		categories: [
			"vehicles",
			"electronics",
			"home-garden",
			"fashion",
			"sports-equipment",
			"books-media",
			"kids-baby",
			"other",
		],
		emoji: "⚡",
	},
	{
		name: { fr: "Vendu en lot", en: "Sold as a bundle" },
		slug: "bundle",
		categories: [
			"electronics",
			"home-garden",
			"fashion",
			"sports-equipment",
			"books-media",
			"kids-baby",
		],
		emoji: "📦",
	},
	// ── Confiance / Qualité ────────────────────────────────────
	{
		name: { fr: "Garantie incluse", en: "Warranty included" },
		slug: "warranty",
		categories: ["vehicles", "electronics", "appliances", "furniture"],
		emoji: "✅",
	},
	{
		name: { fr: "Facture disponible", en: "Receipt available" },
		slug: "receipt",
		categories: [
			"vehicles",
			"electronics",
			"appliances",
			"furniture",
			"watches-jewelry",
		],
		emoji: "🧾",
	},
	{
		name: { fr: "Premier propriétaire", en: "First owner" },
		slug: "first-owner",
		categories: ["vehicles", "electronics"],
		emoji: "🔑",
	},
	{
		name: { fr: "Neuf avec étiquette", en: "New with tags" },
		slug: "new-with-tags",
		categories: ["fashion", "kids-baby"],
		emoji: "🏷️",
	},
	// ── Logistique / Visite ────────────────────────────────────
	{
		name: { fr: "Démonstration possible", en: "Demo possible" },
		slug: "demo",
		categories: ["electronics", "appliances"],
		emoji: "👁️",
	},
	{
		name: { fr: "Visite possible", en: "Viewing possible" },
		slug: "visit",
		categories: ["real-estate", "vehicles"],
		emoji: "🏠",
	},
	// ── Emploi ─────────────────────────────────────────────────
	{
		name: { fr: "Temps plein", en: "Full-time" },
		slug: "full-time",
		categories: ["job-offers"],
		emoji: "⏰",
	},
	{
		name: { fr: "Temps partiel", en: "Part-time" },
		slug: "part-time",
		categories: ["job-offers"],
		emoji: "🕐",
	},
	{
		name: { fr: "Télétravail", en: "Remote work" },
		slug: "remote",
		categories: ["job-offers"],
		emoji: "🌐",
	},
];

export async function seedTags(payload: Payload): Promise<number> {
	let created = 0;
	let scoped = 0;
	let skipped = 0;

	const categories = await payload.find({
		collection: "categories",
		depth: 0,
		limit: 0,
		pagination: false,
		overrideAccess: true,
	});
	const idBySlug = new Map(
		categories.docs.map((category) => [category.slug, String(category.id)]),
	);

	for (const tag of TAG_DEFINITIONS) {
		const scope = tag.categories
			.map((slug) => idBySlug.get(slug))
			.filter((id): id is string => Boolean(id));
		const existing = await payload.find({
			collection: "tags",
			where: { slug: { equals: tag.slug } },
			depth: 0,
			limit: 1,
			overrideAccess: true,
		});
		const found = existing.docs[0];

		if (found) {
			// An admin's own scope is kept; only a tag offered nowhere is caught up.
			if ((found.categories ?? []).length === 0 && scope.length > 0) {
				await payload.update({
					collection: "tags",
					id: found.id,
					data: { categories: scope },
					overrideAccess: true,
				});
				scoped++;
			} else {
				skipped++;
			}
			continue;
		}

		const doc = await payload.create({
			collection: "tags",
			locale: "fr",
			data: { ...tag, name: tag.name.fr, categories: scope },
			overrideAccess: true,
		});
		await payload.update({
			collection: "tags",
			id: doc.id,
			locale: "en",
			data: { name: tag.name.en },
			overrideAccess: true,
		});
		created++;
	}

	payload.logger.info(
		`Tags seed complete: ${created} created, ${scoped} scoped, ${skipped} left as they were.`,
	);

	return created;
}
