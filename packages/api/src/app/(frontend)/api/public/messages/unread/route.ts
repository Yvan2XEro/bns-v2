import { getPayload } from "payload";
import config from "@payload-config";
import { headers as getHeaders } from "next/headers";

export async function GET() {
	try {
		const payload = await getPayload({ config });
		const headers = await getHeaders();

		const { user } = await payload.auth({ headers });
		if (!user) {
			return Response.json({ count: 0 });
		}

		// First get conversations the user participates in
		const conversations = await payload.find({
			collection: "conversations",
			where: { participants: { equals: user.id } },
			limit: 200,
			depth: 0,
		});

		if (conversations.docs.length === 0) {
			return Response.json({ count: 0 });
		}

		const conversationIds = conversations.docs.map((c) => c.id);

		// Count unread messages in those conversations not sent by the user
		const result = await payload.find({
			collection: "messages",
			where: {
				and: [
					{ conversation: { in: conversationIds } },
					{ read: { equals: false } },
					{ sender: { not_equals: user.id } },
				],
			},
			limit: 0,
		});

		return Response.json({ count: result.totalDocs });
	} catch (error) {
		console.error("[unread-messages]", error);
		return Response.json({ count: 0 });
	}
}
