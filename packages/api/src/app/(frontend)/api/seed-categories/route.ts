import config from "@payload-config";
import { headers } from "next/headers";
import { getPayload } from "payload";
import { seedCategories } from "../../../../seed/seedCategories";

export const maxDuration = 60;

export async function POST(): Promise<Response> {
	const payload = await getPayload({ config });
	const requestHeaders = await headers();

	const { user } = await payload.auth({ headers: requestHeaders });

	if (!user) {
		return new Response("Action forbidden.", { status: 403 });
	}

	const userWithRole = user as { role?: string };
	if (userWithRole.role !== "admin") {
		return new Response("Only admins can seed categories.", { status: 403 });
	}

	try {
		payload.logger.info("Seeding categories from admin dashboard...");

		// Clear existing categories and their media
		await payload.delete({
			collection: "categories",
			where: {},
			overrideAccess: true,
		});

		const categories = await seedCategories(payload);

		payload.logger.info(
			`Categories seeded successfully! Created ${categories.length} categories.`,
		);

		return Response.json({
			success: true,
			count: categories.length,
		});
	} catch (e) {
		payload.logger.error({ err: e, message: "Error seeding categories" });
		return new Response("Error seeding categories.", { status: 500 });
	}
}
