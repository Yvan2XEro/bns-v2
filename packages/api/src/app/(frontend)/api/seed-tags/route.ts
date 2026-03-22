import config from "@payload-config";
import { headers } from "next/headers";
import { getPayload } from "payload";
import { seedTags } from "../../../../seed/seedTags";

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
		return new Response("Only admins can seed tags.", { status: 403 });
	}

	try {
		payload.logger.info("Seeding tags from admin dashboard...");

		const count = await seedTags(payload);

		payload.logger.info(`Tags seeded successfully! Created ${count} tags.`);

		return Response.json({ success: true, count });
	} catch (e) {
		payload.logger.error({ err: e, message: "Error seeding tags" });
		return new Response("Error seeding tags.", { status: 500 });
	}
}
