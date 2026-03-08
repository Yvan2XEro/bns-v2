import { getPayload } from "payload";
import config from "../payload.config";
import { seedCategories } from "./seedCategories";
import { seedConversations } from "./seedConversations";
import { seedFavorites } from "./seedFavorites";
import { seedListings } from "./seedListings";
import { seedReports } from "./seedReports";
import { seedReviews } from "./seedReviews";
import { seedUsers } from "./seedUsers";

const clearCollections = async (
	payload: Awaited<ReturnType<typeof getPayload>>,
) => {
	console.log("Clearing collections...");

	const collections = [
		"boost-payments",
		"reports",
		"reviews",
		"messages",
		"conversations",
		"favorites",
		"listings",
		"categories",
		"users",
	];

	for (const collection of collections) {
		try {
			await payload.delete({
				collection,
				where: {},
				overrideAccess: true,
			});
		} catch {
			console.log(`Collection ${collection} cleared or not exists`);
		}
	}
};

export const seed = async () => {
	console.log("Starting seed process...\n");

	const payload = await getPayload({ config });

	if (process.env.NODE_ENV === "production") {
		console.error("SEEDING IS NOT ALLOWED IN PRODUCTION!");
		process.exit(1);
	}

	console.log("=== Database Seeding ===\n");

	await clearCollections(payload);

	console.log("\n--- Seeding Users ---");
	const { users, admins, moderators, regularUsers } = await seedUsers(payload);
	console.log(
		`Created: ${admins.length} admins, ${moderators.length} moderators, ${regularUsers.length} users`,
	);

	console.log("\n--- Seeding Categories ---");
	const categories = await seedCategories(payload);
	console.log(`Created: ${categories.length} categories`);

	console.log("\n--- Seeding Listings ---");
	const listings = await seedListings(payload, categories, regularUsers);
	console.log(`Created: ${listings.length} listings`);

	console.log("\n--- Seeding Favorites ---");
	const favoritesCount = await seedFavorites(payload, regularUsers, listings);
	console.log(`Created: ${favoritesCount} favorites`);

	console.log("\n--- Seeding Conversations & Messages ---");
	const { conversations, messagesCount } = await seedConversations(
		payload,
		listings,
		regularUsers,
	);
	console.log(
		`Created: ${conversations.length} conversations, ${messagesCount} messages`,
	);

	console.log("\n--- Seeding Reviews ---");
	const reviewsCount = await seedReviews(payload, regularUsers);
	console.log(`Created: ${reviewsCount} reviews`);

	console.log("\n--- Seeding Reports ---");
	const reportsCount = 0;
	// await seedReports(payload, listings, regularUsers, admins);
	console.log(`Created: ${reportsCount} reports`);

	console.log("\n=== Seed Complete ===\n");
	console.log("Summary:");
	console.log(`  Users: ${users.length}`);
	console.log(`  Categories: ${categories.length}`);
	console.log(`  Listings: ${listings.length}`);
	console.log(`  Conversations: ${conversations.length}`);
	console.log(`  Messages: ${messagesCount}`);
	console.log(`  Reviews: ${reviewsCount}`);
	console.log(`  Reports: ${reportsCount}`);
	console.log(`  Favorites: ${favoritesCount}`);

	return {
		users,
		categories,
		listings,
		conversations,
	};
};

seed().catch(console.error);
