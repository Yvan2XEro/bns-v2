import { faker } from "@faker-js/faker";

const carAttributes = () => {
	const brands = ["Toyota", "Honda", "BMW", "Mercedes", "Ford"];
	const models: Record<string, string[]> = {
		Toyota: ["Corolla", "Camry", "RAV4", "Highlander", "Tacoma"],
		Honda: ["Civic", "Accord", "CR-V", "Pilot", "HR-V"],
		BMW: ["3 Series", "5 Series", "X3", "X5", "M3"],
		Mercedes: ["C-Class", "E-Class", "GLC", "GLE", "S-Class"],
		Ford: ["F-150", "Mustang", "Explorer", "Escape", "Bronco"],
	};
	const fuels = ["Petrol", "Diesel", "Electric"];
	const transmissions = ["Automatic", "Manual"];
	const colors = [
		"Black",
		"White",
		"Silver",
		"Blue",
		"Red",
		"Gray",
		"Green",
		"Brown",
	];

	const brand = faker.helpers.arrayElement(brands);
	return {
		brand,
		model: faker.helpers.arrayElement(models[brand] || ["Model"]),
		year: faker.number.int({ min: 2010, max: 2024 }),
		mileage: faker.number.int({ min: 5000, max: 200000 }),
		fuelType: faker.helpers.arrayElement(fuels),
		transmission: faker.helpers.arrayElement(transmissions),
		color: faker.helpers.arrayElement(colors),
	};
};

const motorcycleAttributes = () => {
	const brands = ["Yamaha", "Honda", "Kawasaki"];
	const models: Record<string, string[]> = {
		Yamaha: ["MT-07", "R1", "Tracer 700", "XSR700", "TMAX"],
		Honda: ["CBR600RR", "Africa Twin", "Gold Wing", "Rebel 500", "PCX150"],
		Kawasaki: ["Ninja 400", "Z900", "Versys 650", "KLR650", "ZX-10R"],
	};
	const types = ["Sport", "Cruiser", "Touring", "Off-road", "Scooter"];

	const brand = faker.helpers.arrayElement(brands);
	return {
		brand,
		model: faker.helpers.arrayElement(models[brand] || ["Model"]),
		year: faker.number.int({ min: 2015, max: 2024 }),
		mileage: faker.number.int({ min: 1000, max: 50000 }),
		engineSize: faker.number.int({ min: 125, max: 2000 }),
		type: faker.helpers.arrayElement(types),
	};
};

const apartmentAttributes = () => {
	const furnishedOptions = [true, false];
	const parkingOptions = [true, false];
	const balconyOptions = [true, false];

	return {
		surface: faker.number.int({ min: 30, max: 200 }),
		rooms: faker.number.int({ min: 1, max: 5 }),
		bathrooms: faker.number.int({ min: 1, max: 3 }),
		furnished: faker.helpers.arrayElement(furnishedOptions),
		floor: faker.number.int({ min: 1, max: 20 }),
		parking: faker.helpers.arrayElement(parkingOptions),
		balcony: faker.helpers.arrayElement(balconyOptions),
	};
};

const houseAttributes = () => {
	const furnishedOptions = [true, false];
	const parkingOptions = [true, false];
	const gardenOptions = [true, false];

	return {
		surface: faker.number.int({ min: 80, max: 500 }),
		landSize: faker.number.int({ min: 100, max: 2000 }),
		rooms: faker.number.int({ min: 2, max: 8 }),
		bathrooms: faker.number.int({ min: 1, max: 5 }),
		furnished: faker.helpers.arrayElement(furnishedOptions),
		parking: faker.helpers.arrayElement(parkingOptions),
		garden: faker.helpers.arrayElement(gardenOptions),
	};
};

const phoneAttributes = () => {
	const brands = [
		"Apple",
		"Samsung",
		"Google",
		"OnePlus",
		"Xiaomi",
		"Huawei",
		"Sony",
		"Nokia",
	];
	const storages = ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB"];
	const conditions = ["New", "Like New", "Good", "Fair"];
	const colors = ["Black", "White", "Blue", "Red", "Green", "Gold", "Silver"];

	const brand = faker.helpers.arrayElement(brands);
	return {
		brand,
		model: `${brand} ${faker.number.int({ min: 10, max: 15 })}`,
		storage: faker.helpers.arrayElement(storages),
		condition: faker.helpers.arrayElement(conditions),
		batteryHealth: faker.number.int({ min: 70, max: 100 }),
		color: faker.helpers.arrayElement(colors),
	};
};

const computerAttributes = () => {
	const brands = ["Apple", "Dell", "HP"];
	const processors = [
		"Intel i5",
		"Intel i7",
		"Intel i9",
		"AMD Ryzen 5",
		"AMD Ryzen 7",
		"Apple M1",
		"Apple M2",
	];
	const rams = ["8GB", "16GB", "32GB"];
	const conditions = ["New", "Like New", "Good", "Fair"];

	const brand = faker.helpers.arrayElement(brands);
	return {
		brand,
		model: `${brand} ${faker.lorem.word()} ${faker.number.int({ min: 3000, max: 7000 })}`,
		processor: faker.helpers.arrayElement(processors),
		ram: faker.helpers.arrayElement(rams),
		storage: `${faker.number.int({ min: 128, max: 2000 })}GB SSD`,
		condition: faker.helpers.arrayElement(conditions),
	};
};

const furnitureAttributes = () => {
	const types = [
		"Sofa",
		"Bed",
		"Table",
		"Chair",
		"Cabinet",
		"Desk",
		"Wardrobe",
	];
	const materials = ["Wood", "Metal", "Glass", "Leather", "Fabric", "Plastic"];
	const colors = ["Black", "White", "Brown", "Gray", "Beige", "Blue", "Green"];
	const conditions = ["New", "Used"];

	return {
		type: faker.helpers.arrayElement(types),
		material: faker.helpers.arrayElement(materials),
		color: faker.helpers.arrayElement(colors),
		condition: faker.helpers.arrayElement(conditions),
		dimensions: `${faker.number.int({ min: 50, max: 200 })}x${faker.number.int({ min: 30, max: 100 })}x${faker.number.int({ min: 40, max: 150 })}cm`,
	};
};

const categoryAttributeGenerators: Record<
	string,
	() => Record<string, unknown>
> = {
	cars: carAttributes,
	motorcycles: motorcycleAttributes,
	apartments: apartmentAttributes,
	houses: houseAttributes,
	phones: phoneAttributes,
	computers: computerAttributes,
	furniture: furnitureAttributes,
};

const listingTitles: Record<string, () => string> = {
	cars: () => {
		const brands = [
			"Toyota",
			"Honda",
			"BMW",
			"Mercedes",
			"Ford",
			"Chevrolet",
			"Volkswagen",
			"Hyundai",
			"Nissan",
			"Audi",
		];
		const models = [
			"Corolla",
			"Civic",
			"3 Series",
			"C-Class",
			"F-150",
			"Malibu",
			"Golf",
			"Elantra",
			"Altima",
			"A4",
		];
		const years = [2018, 2019, 2020, 2021, 2022, 2023];
		return `${faker.helpers.arrayElement(brands)} ${faker.helpers.arrayElement(models)} ${faker.helpers.arrayElement(years)} - ${faker.lorem.words(2)}`;
	},
	motorcycles: () => {
		const brands = ["Yamaha", "Honda", "Kawasaki", "Suzuki", "Harley-Davidson"];
		return `${faker.helpers.arrayElement(brands)} ${faker.lorem.words(2)} - Excellent Condition`;
	},
	apartments: () => {
		const rooms = [1, 2, 3, 4];
		return `Beautiful ${faker.helpers.arrayElement(rooms)}-Room Apartment in ${faker.location.city()}`;
	},
	houses: () => {
		const sizes = ["Spacious", "Cozy", "Modern", "Luxurious"];
		return `${faker.helpers.arrayElement(sizes)} House with ${faker.number.int({ min: 2, max: 6 })} Rooms`;
	},
	phones: () => {
		const brands = ["iPhone", "Samsung Galaxy", "Google Pixel", "OnePlus"];
		const models = ["Pro", "Plus", "Ultra", "Max", "Lite"];
		return `${faker.helpers.arrayElement(brands)} ${faker.helpers.arrayElement(models)} - ${faker.number.int({ min: 64, max: 512 })}GB`;
	},
	computers: () => {
		const brands = ["MacBook", "Dell XPS", "HP Spectre", "Lenovo ThinkPad"];
		return `${faker.helpers.arrayElement(brands)} - ${faker.number.int({ min: 8, max: 32 })}GB RAM`;
	},
	furniture: () => {
		const types = [
			"Sofa",
			"Dining Table",
			"Bed Frame",
			"Office Desk",
			"Wardrobe",
		];
		return `${faker.helpers.arrayElement(types)} - ${faker.lorem.words(2)}`;
	},
};

const listingPrices: Record<string, () => number> = {
	cars: () => faker.number.int({ min: 5000, max: 80000 }),
	motorcycles: () => faker.number.int({ min: 2000, max: 25000 }),
	apartments: () => faker.number.int({ min: 30000, max: 300000 }),
	houses: () => faker.number.int({ min: 80000, max: 800000 }),
	phones: () => faker.number.int({ min: 100, max: 1500 }),
	computers: () => faker.number.int({ min: 300, max: 3000 }),
	furniture: () => faker.number.int({ min: 50, max: 2000 }),
};

interface Category {
	id: string;
	slug: string;
}

interface User {
	id: string;
}

export const seedListings = async (
	payload: unknown,
	categories: Category[],
	users: User[],
) => {
	const listings: { id: string }[] = [];

	const leafCategories = categories.filter((c) =>
		[
			"cars",
			"motorcycles",
			"apartments",
			"houses",
			"phones",
			"computers",
			"furniture",
		].includes(c.slug),
	);

	for (let i = 0; i < 200; i++) {
		const category = faker.helpers.arrayElement(leafCategories);
		const seller = faker.helpers.arrayElement(users);
		const generator = categoryAttributeGenerators[category.slug];
		const attributes = generator ? generator() : {};

		const titleFn = listingTitles[category.slug];
		const title = titleFn ? titleFn() : faker.commerce.productName();

		const priceFn = listingPrices[category.slug];
		const price = priceFn
			? priceFn()
			: faker.number.int({ min: 10, max: 1000 });

		const statuses: ("draft" | "published" | "sold")[] = [
			"published",
			"published",
			"published",
			"sold",
		];
		const status = faker.helpers.arrayElement(statuses);

		const imageCount = faker.number.int({ min: 1, max: 5 });
		const images: unknown[] = [];

		// Provide empty images array for validation - the hook handles it
		const result = await (
			payload as {
				create: (options: {
					collection: string;
					data: Record<string, unknown>;
				}) => Promise<{ id: string }>;
			}
		).create({
			collection: "listings",
			data: {
				title,
				description: faker.lorem.paragraph(),
				price,
				location: `${faker.location.city()}, ${faker.location.country()}`,
				category: category.id,
				seller: seller.id,
				status,
				attributes,
				condition: faker.helpers.arrayElement([
					"new",
					"like_new",
					"good",
					"fair",
					"poor",
				]),
				images,
				views: faker.number.int({ min: 0, max: 1000 }),
			},
		});

		if (status === "published" && Math.random() > 0.7) {
			const boostedUntil = new Date();
			boostedUntil.setDate(
				boostedUntil.getDate() + faker.number.int({ min: 7, max: 30 }),
			);

			await (
				payload as {
					update: (options: {
						collection: string;
						id: string;
						data: Record<string, unknown>;
					}) => Promise<unknown>;
				}
			).update({
				collection: "listings",
				id: result.id,
				data: {
					boostedUntil: boostedUntil.toISOString(),
				},
			});

			await (
				payload as {
					create: (options: {
						collection: string;
						data: Record<string, unknown>;
					}) => Promise<unknown>;
				}
			).create({
				collection: "boost-payments",
				data: {
					listing: result.id,
					user: seller.id,
					amount: faker.number.int({ min: 500, max: 2000 }),
					duration: faker.helpers.arrayElement(["7", "14", "30"]),
					status: "completed",
					paymentProvider: "notchpay",
					paymentReference: `BOOST-${result.id}-${Date.now()}`,
				},
			});
		}

		listings.push(result);
	}

	return listings;
};
