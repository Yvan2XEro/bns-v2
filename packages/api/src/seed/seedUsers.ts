import { faker } from "@faker-js/faker";

interface SeedUser {
	id: string;
	email: string;
	name: string;
}

export const seedUsers = async (payload: unknown) => {
	const users: SeedUser[] = [];
	const admins: SeedUser[] = [];
	const moderators: SeedUser[] = [];
	const regularUsers: SeedUser[] = [];

	const createUser = async (
		role: "admin" | "moderator" | "user",
		index: number,
	): Promise<SeedUser> => {
		const name = faker.person.fullName();
		const email =
			role === "admin"
				? `admin${index}@marketplace.dev`
				: role === "moderator"
					? `mod${index}@marketplace.dev`
					: faker.internet.email({ firstName: name.split(" ")[0] });

		const result = await (
			payload as {
				create: (options: {
					collection: string;
					data: {
						email: string;
						password: string;
						name: string;
						role: string;
						rating: number;
						totalReviews: number;
					};
				}) => Promise<{ id: string; email: string; name: string }>;
			}
		).create({
			collection: "users",
			data: {
				email,
				password: "password123",
				name,
				role,
				rating:
					role === "user"
						? Number(faker.number.float({ min: 3, max: 5 }).toFixed(1))
						: 5,
				totalReviews:
					role === "user" ? faker.number.int({ min: 0, max: 50 }) : 0,
			},
		});

		return result;
	};

	for (let i = 1; i <= 5; i++) {
		const admin = await createUser("admin", i);
		admins.push(admin);
		users.push(admin);
	}

	for (let i = 1; i <= 5; i++) {
		const mod = await createUser("moderator", i);
		moderators.push(mod);
		users.push(mod);
	}

	for (let i = 1; i <= 50; i++) {
		const user = await createUser("user", i);
		regularUsers.push(user);
		users.push(user);
	}

	return { users, admins, moderators, regularUsers };
};
