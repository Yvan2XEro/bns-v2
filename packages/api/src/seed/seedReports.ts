import { faker } from "@faker-js/faker";

interface User {
	id: string;
}

interface Listing {
	id: string;
}

export const seedReports = async (
	payload: unknown,
	listings: Listing[],
	users: User[],
	admins: User[],
) => {
	let count = 0;
	const reasons = [
		"spam",
		"inappropriate",
		"fraud",
		"prohibited",
		"harassment",
		"other",
	];
	const statuses: ("pending" | "reviewed" | "resolved")[] = [
		"pending",
		"reviewed",
		"resolved",
	];

	for (let i = 0; i < 20; i++) {
		const reporter = faker.helpers.arrayElement(users);
		const reason = faker.helpers.arrayElement(reasons);

		const isListingReport = Math.random() > 0.3;
		let targetId: string;
		let targetType: "listing" | "user" | "message";

		if (isListingReport) {
			const listing = faker.helpers.arrayElement(listings);
			targetId = listing.id;
			targetType = "listing";
		} else {
			const otherUser = faker.helpers.arrayElement(
				users.filter((u) => u.id !== reporter.id),
			);
			targetId = otherUser.id;
			targetType = "user";
		}

		const status = faker.helpers.arrayElement(statuses);

		const reportData: Record<string, unknown> = {
			reporter: reporter.id,
			targetType,
			targetId,
			reason,
			status,
			description: faker.lorem.sentence(),
		};

		if (status !== "pending") {
			reportData.resolvedBy = faker.helpers.arrayElement(admins).id;
			reportData.resolution = faker.lorem.sentence();
		}

		await (
			payload as {
				create: (options: {
					collection: string;
					data: Record<string, unknown>;
				}) => Promise<unknown>;
			}
		).create({
			collection: "reports",
			data: reportData,
		});

		count++;
	}

	return count;
};
