import config from "@payload-config";
import { getPayload } from "payload";

export async function GET(request: Request) {
	try {
		const payload = await getPayload({ config });
		const { searchParams } = new URL(request.url);
		const id = searchParams.get("id");
		const slug = searchParams.get("slug");

		if (id) {
			const category = await payload.findByID({
				collection: "categories",
				id,
				depth: 1,
			});

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
				depth: 1,
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
				attributes: category.attributes || [],
			});
		}

		const result = await payload.find({
			collection: "categories",
			where: {
				active: { equals: true },
			},
			depth: 1,
		});

		const categories = result.docs.map((cat) => ({
			id: cat.id,
			name: cat.name,
			slug: cat.slug,
			description: cat.description,
			icon: cat.icon,
			image: cat.image,
			parent: cat.parent,
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
