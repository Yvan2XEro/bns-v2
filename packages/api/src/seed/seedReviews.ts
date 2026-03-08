import { faker } from "@faker-js/faker";

interface User {
	id: string;
}

export const seedReviews = async (payload: unknown, users: User[]) => {
	let count = 0;
	const reviewPairs = new Set<string>();

	const possibleComments = [
		"Great seller! Item exactly as described.",
		"Fast shipping and good communication.",
		"Would buy from again.",
		"Item was in better condition than expected.",
		"Professional and reliable.",
		"Excellent experience overall.",
		"Good transaction, recommend!",
		"Item matched the description perfectly.",
		"Quick response and delivery.",
		"Very satisfied with my purchase.",
	];

	for (let i = 0; i < 60; i++) {
		const reviewer = faker.helpers.arrayElement(users);
		let reviewedUser = faker.helpers.arrayElement(users);

		while (reviewedUser.id === reviewer.id) {
			reviewedUser = faker.helpers.arrayElement(users);
		}

		const pairKey = `${reviewer.id}-${reviewedUser.id}-${i}`;
		if (reviewPairs.has(pairKey)) continue;
		reviewPairs.add(pairKey);

		await (
			payload as {
				create: (options: {
					collection: string;
					data: Record<string, unknown>;
				}) => Promise<unknown>;
			}
		).create({
			collection: "reviews",
			data: {
				reviewer: reviewer.id,
				reviewedUser: reviewedUser.id,
				rating: faker.number.int({ min: 3, max: 5 }),
				comment: faker.helpers.arrayElement(possibleComments),
			},
		});

		count++;
	}

	return count;
};
