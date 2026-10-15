import type { Payload } from "payload";

interface TagData {
	name: string;
	slug: string;
	emoji: string;
	/**
	 * Category slugs the tag is offered in; their subcategories inherit it.
	 * Leisure is listed by child so holiday rentals never get "delivery".
	 */
	categories: string[];
}

const TAG_DEFINITIONS: TagData[] = [
	// ── Transaction ────────────────────────────────────────────
	{
		name: "Négociable",
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
		name: "Échange possible",
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
		name: "Livraison disponible",
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
		name: "Vente urgente",
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
		name: "Vendu en lot",
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
		name: "Garantie incluse",
		slug: "warranty",
		categories: ["vehicles", "electronics", "appliances", "furniture"],
		emoji: "✅",
	},
	{
		name: "Facture disponible",
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
		name: "Premier propriétaire",
		slug: "first-owner",
		categories: ["vehicles", "electronics"],
		emoji: "🔑",
	},
	{
		name: "Neuf avec étiquette",
		slug: "new-with-tags",
		categories: ["fashion", "kids-baby"],
		emoji: "🏷️",
	},
	// ── Logistique / Visite ────────────────────────────────────
	{
		name: "Démonstration possible",
		slug: "demo",
		categories: ["electronics", "appliances"],
		emoji: "👁️",
	},
	{
		name: "Visite possible",
		slug: "visit",
		categories: ["real-estate", "vehicles"],
		emoji: "🏠",
	},
	// ── Emploi ─────────────────────────────────────────────────
	{
		name: "Temps plein",
		slug: "full-time",
		categories: ["job-offers"],
		emoji: "⏰",
	},
	{
		name: "Temps partiel",
		slug: "part-time",
		categories: ["job-offers"],
		emoji: "🕐",
	},
	{
		name: "Télétravail",
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

		await payload.create({
			collection: "tags",
			data: { ...tag, categories: scope },
			overrideAccess: true,
		});
		created++;
	}

	payload.logger.info(
		`Tags seed complete: ${created} created, ${scoped} scoped, ${skipped} left as they were.`,
	);

	return created;
}
