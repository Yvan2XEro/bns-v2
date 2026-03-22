import type { Payload } from "payload";

interface TagData {
	name: string;
	slug: string;
	emoji: string;
}

// Tags organized by use-case, coherent with the category seed data
// (Vehicles, Electronics, Real Estate, Jobs, Fashion, Agriculture, etc.)
const TAG_DEFINITIONS: TagData[] = [
	// ── Transaction ────────────────────────────────────────────
	{
		name: "Négociable",
		slug: "negotiable",
		emoji: "🤝",
	},
	{
		name: "Échange possible",
		slug: "swap",
		emoji: "🔄",
	},
	{
		name: "Livraison disponible",
		slug: "delivery",
		emoji: "🚚",
	},
	{
		name: "Vente urgente",
		slug: "urgent",
		emoji: "⚡",
	},
	{
		name: "Vendu en lot",
		slug: "bundle",
		emoji: "📦",
	},
	// ── Confiance / Qualité ────────────────────────────────────
	{
		name: "Garantie incluse",
		slug: "warranty",
		emoji: "✅",
	},
	{
		name: "Facture disponible",
		slug: "receipt",
		emoji: "🧾",
	},
	{
		name: "Premier propriétaire",
		slug: "first-owner",
		emoji: "🔑",
	},
	{
		name: "Neuf avec étiquette",
		slug: "new-with-tags",
		emoji: "🏷️",
	},
	// ── Logistique / Visite ────────────────────────────────────
	{
		name: "Démonstration possible",
		slug: "demo",
		emoji: "👁️",
	},
	{
		name: "Visite possible",
		slug: "visit",
		emoji: "🏠",
	},
	// ── Emploi ─────────────────────────────────────────────────
	{
		name: "Temps plein",
		slug: "full-time",
		emoji: "⏰",
	},
	{
		name: "Temps partiel",
		slug: "part-time",
		emoji: "🕐",
	},
	{
		name: "Télétravail",
		slug: "remote",
		emoji: "🌐",
	},
];

export async function seedTags(payload: Payload): Promise<number> {
	let created = 0;
	let skipped = 0;

	for (const tag of TAG_DEFINITIONS) {
		// biome-ignore lint/suspicious/noExplicitAny: tags not yet in generated types
		const existing = await (payload as any).find({
			collection: "tags",
			where: { slug: { equals: tag.slug } },
			limit: 1,
		});

		if (existing.docs.length > 0) {
			skipped++;
			continue;
		}

		// biome-ignore lint/suspicious/noExplicitAny: tags not yet in generated types
		await (payload as any).create({
			collection: "tags",
			data: tag,
			overrideAccess: true,
		});
		created++;
	}

	payload.logger.info(
		`Tags seed complete: ${created} created, ${skipped} already existing.`,
	);

	return created;
}
