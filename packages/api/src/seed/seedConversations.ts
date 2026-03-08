import { faker } from "@faker-js/faker";

interface User {
	id: string;
}

interface Listing {
	id: string;
	seller: string | { id: string };
}

export const seedConversations = async (
	payload: unknown,
	listings: Listing[],
	users: User[],
) => {
	const conversations: { id: string }[] = [];
	let messagesCount = 0;

	const sellerMap: Record<string, string> = {};
	for (const listing of listings) {
		const sellerId =
			typeof listing.seller === "string" ? listing.seller : listing.seller?.id;
		if (sellerId) {
			sellerMap[listing.id] = sellerId;
		}
	}

	const listingKeys = Object.keys(sellerMap);

	if (listingKeys.length === 0) {
		return { conversations: [], messagesCount: 0 };
	}

	for (let i = 0; i < 50; i++) {
		const listingId = faker.helpers.arrayElement(listingKeys);
		const sellerId = sellerMap[listingId];

		const potentialBuyers = users.filter((u) => u.id !== sellerId);
		if (potentialBuyers.length === 0) continue;

		const buyer = faker.helpers.arrayElement(potentialBuyers);

		const conversation = await (
			payload as {
				create: (options: {
					collection: string;
					data: Record<string, unknown>;
				}) => Promise<{ id: string }>;
			}
		).create({
			collection: "conversations",
			data: {
				participants: [sellerId, buyer.id],
				listing: listingId,
			},
		});

		conversations.push(conversation);

		const numMessages = faker.number.int({ min: 3, max: 10 });
		const participants = [sellerId, buyer.id];

		let lastMessageId: string | null = null;

		for (let j = 0; j < numMessages; j++) {
			const sender = faker.helpers.arrayElement(participants);

			const message = await (
				payload as {
					create: (options: {
						collection: string;
						data: Record<string, unknown>;
					}) => Promise<{ id: string }>;
				}
			).create({
				collection: "messages",
				data: {
					conversation: conversation.id,
					sender,
					content: faker.lorem.sentence(),
					read: j < numMessages - 1 ? faker.datatype.boolean() : false,
				},
			});

			lastMessageId = message.id;
			messagesCount++;
		}

		if (lastMessageId) {
			await (
				payload as {
					update: (options: {
						collection: string;
						id: string;
						data: Record<string, unknown>;
					}) => Promise<unknown>;
				}
			).update({
				collection: "conversations",
				id: conversation.id,
				data: {
					lastMessage: lastMessageId,
				},
			});
		}
	}

	return { conversations, messagesCount };
};
