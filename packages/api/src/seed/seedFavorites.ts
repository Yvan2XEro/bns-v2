import { faker } from "@faker-js/faker";

interface User {
	id: string;
}

interface Listing {
	id: string;
}

export const seedFavorites = async (
	payload: unknown,
	users: User[],
	listings: Listing[],
) => {
	const favoriteIds = new Set<string>();
	let count = 0;

	for (const user of users) {
		const numFavorites = faker.number.int({ min: 3, max: 10 });

		for (let i = 0; i < numFavorites; i++) {
			const listing = faker.helpers.arrayElement(listings);
			const key = `${user.id}-${listing.id}`;

			if (!favoriteIds.has(key)) {
				await (
					payload as {
						create: (options: {
							collection: string;
							data: Record<string, unknown>;
						}) => Promise<unknown>;
					}
				).create({
					collection: "favorites",
					data: {
						user: user.id,
						listing: listing.id,
					},
				});

				favoriteIds.add(key);
				count++;
			}
		}
	}

	return count;
};
