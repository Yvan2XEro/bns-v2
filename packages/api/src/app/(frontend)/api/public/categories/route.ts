import config from "@payload-config";
import { getPayload } from "payload";

type CategoryResponseShape = {
	id: string;
	name: string;
	slug: string;
	description?: string | null;
	icon?: string | null;
	image?: string | null;
	parent?: unknown;
	active?: boolean | null;
	attributes?: unknown[];
	listingType?: unknown;
	formPreset?: unknown;
};

function parseDepth(value: string | null): number {
	if (!value) return 1;

	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 0) return 1;

	return parsed;
}

export async function GET(request: Request) {
	try {
		const payload = await getPayload({ config });
		const { searchParams } = new URL(request.url);
		const id = searchParams.get("id");
		const slug = searchParams.get("slug");
		const depth = parseDepth(searchParams.get("depth"));

		if (id) {
			const category = (await payload.findByID({
				collection: "categories",
				id,
				depth,
			})) as CategoryResponseShape | null;

			if (!category) {
				return Response.json({ error: "Category not found" }, { status: 404 });
			}

			return Response.json({
				id: category.id,
				name: category.name,
				slug: category.slug,
				description: category.description,
				icon: category.icon,
				image: category.image,
				parent: category.parent,
				active: category.active,
				listingType: category.listingType,
				formPreset: category.formPreset,
				attributes: category.attributes || [],
			});
		}

		if (slug) {
			const result = await payload.find({
				collection: "categories",
				where: {
					slug: { equals: slug },
					active: { equals: true },
				},
				depth,
				limit: 1,
			});

			if (result.docs.length === 0) {
				return Response.json({ error: "Category not found" }, { status: 404 });
			}

			const category = result.docs[0];
			return Response.json({
				id: category.id,
				name: category.name,
				slug: category.slug,
				description: category.description,
				icon: category.icon,
				image: category.image,
				parent: category.parent,
				active: category.active,
				listingType: (category as CategoryResponseShape).listingType,
				formPreset: (category as CategoryResponseShape).formPreset,
				attributes: category.attributes || [],
			});
		}

		const result = await payload.find({
			collection: "categories",
			where: {
				active: { equals: true },
			},
			depth,
			limit: 0,
			pagination: false,
		});

		const categories = result.docs.map((cat) => ({
			id: cat.id,
			name: cat.name,
			slug: cat.slug,
			description: cat.description,
			icon: cat.icon,
			image: cat.image,
			parent: cat.parent,
			listingType: (cat as CategoryResponseShape).listingType,
			formPreset: (cat as CategoryResponseShape).formPreset,
			attributes: cat.attributes || [],
		}));

		return Response.json({ categories });
	} catch (error) {
		console.error("Categories API error:", error);
		return Response.json(
			{ error: "Failed to fetch categories" },
			{ status: 500 },
		);
	}
}
