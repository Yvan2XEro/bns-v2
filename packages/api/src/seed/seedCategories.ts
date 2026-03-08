import { faker } from "@faker-js/faker";

interface CategoryData {
	name: string;
	slug: string;
	description: string;
	attributes: Array<{
		name: string;
		slug: string;
		type: "text" | "number" | "select" | "boolean" | "date";
		required: boolean;
		filterable: boolean;
		options?: { value: string }[];
	}>;
	parent?: string;
}

const categoryDefinitions: CategoryData[] = [
	{
		name: "Vehicles",
		slug: "vehicles",
		description: "Cars, motorcycles, and other vehicles",
		attributes: [],
	},
	{
		name: "Cars",
		slug: "cars",
		description: "Used and new cars",
		attributes: [
			{
				name: "Brand",
				slug: "brand",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Toyota" },
					{ value: "Honda" },
					{ value: "BMW" },
					{ value: "Mercedes" },
					{ value: "Ford" },
				],
			},
			{
				name: "Model",
				slug: "model",
				type: "text",
				required: true,
				filterable: false,
			},
			{
				name: "Year",
				slug: "year",
				type: "number",
				required: true,
				filterable: true,
			},
			{
				name: "Mileage",
				slug: "mileage",
				type: "number",
				required: true,
				filterable: true,
			},
			{
				name: "Fuel Type",
				slug: "fuelType",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Petrol" },
					{ value: "Diesel" },
					{ value: "Electric" },
				],
			},
			{
				name: "Transmission",
				slug: "transmission",
				type: "select",
				required: true,
				filterable: true,
				options: [{ value: "Automatic" }, { value: "Manual" }],
			},
		],
		parent: "vehicles",
	},
	{
		name: "Motorcycles",
		slug: "motorcycles",
		description: "Motorcycles and scooters",
		attributes: [
			{
				name: "Brand",
				slug: "brand",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Yamaha" },
					{ value: "Honda" },
					{ value: "Kawasaki" },
				],
			},
			{
				name: "Model",
				slug: "model",
				type: "text",
				required: true,
				filterable: false,
			},
			{
				name: "Year",
				slug: "year",
				type: "number",
				required: true,
				filterable: true,
			},
		],
		parent: "vehicles",
	},
	{
		name: "Real Estate",
		slug: "real-estate",
		description: "Properties for sale and rent",
		attributes: [],
	},
	{
		name: "Apartments",
		slug: "apartments",
		description: "Apartments and flats",
		attributes: [
			{
				name: "Surface",
				slug: "surface",
				type: "number",
				required: true,
				filterable: true,
			},
			{
				name: "Rooms",
				slug: "rooms",
				type: "number",
				required: true,
				filterable: true,
			},
			{
				name: "Bathrooms",
				slug: "bathrooms",
				type: "number",
				required: true,
				filterable: true,
			},
			{
				name: "Furnished",
				slug: "furnished",
				type: "boolean",
				required: false,
				filterable: true,
			},
		],
		parent: "real-estate",
	},
	{
		name: "Houses",
		slug: "houses",
		description: "Houses and villas",
		attributes: [
			{
				name: "Surface",
				slug: "surface",
				type: "number",
				required: true,
				filterable: true,
			},
			{
				name: "Rooms",
				slug: "rooms",
				type: "number",
				required: true,
				filterable: true,
			},
			{
				name: "Parking",
				slug: "parking",
				type: "boolean",
				required: false,
				filterable: true,
			},
		],
		parent: "real-estate",
	},
	{
		name: "Electronics",
		slug: "electronics",
		description: "Phones, computers, and gadgets",
		attributes: [],
	},
	{
		name: "Phones",
		slug: "phones",
		description: "Mobile phones and smartphones",
		attributes: [
			{
				name: "Brand",
				slug: "brand",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Apple" },
					{ value: "Samsung" },
					{ value: "Google" },
				],
			},
			{
				name: "Storage",
				slug: "storage",
				type: "select",
				required: true,
				filterable: true,
				options: [{ value: "64GB" }, { value: "128GB" }, { value: "256GB" }],
			},
			{
				name: "Condition",
				slug: "condition",
				type: "select",
				required: true,
				filterable: true,
				options: [{ value: "New" }, { value: "Used" }],
			},
		],
		parent: "electronics",
	},
	{
		name: "Computers",
		slug: "computers",
		description: "Laptops and desktops",
		attributes: [
			{
				name: "Brand",
				slug: "brand",
				type: "select",
				required: true,
				filterable: true,
				options: [{ value: "Apple" }, { value: "Dell" }, { value: "HP" }],
			},
			{
				name: "RAM",
				slug: "ram",
				type: "select",
				required: true,
				filterable: true,
				options: [{ value: "8GB" }, { value: "16GB" }, { value: "32GB" }],
			},
		],
		parent: "electronics",
	},
	{
		name: "Furniture",
		slug: "furniture",
		description: "Home and office furniture",
		attributes: [
			{
				name: "Type",
				slug: "type",
				type: "select",
				required: true,
				filterable: true,
				options: [{ value: "Sofa" }, { value: "Bed" }, { value: "Table" }],
			},
			{
				name: "Condition",
				slug: "condition",
				type: "select",
				required: true,
				filterable: true,
				options: [{ value: "New" }, { value: "Used" }],
			},
		],
	},
];

export const seedCategories = async (payload: unknown) => {
	const createdCategories: Array<{ id: string; slug: string }> = [];

	const slugToId: Record<string, string> = {};

	for (const catDef of categoryDefinitions) {
		const parentId = catDef.parent ? slugToId[catDef.parent] : undefined;

		const result = await (
			payload as {
				create: (options: {
					collection: string;
					data: Record<string, unknown>;
				}) => Promise<{ id: string; slug: string }>;
			}
		).create({
			collection: "categories",
			data: {
				name: catDef.name,
				slug: catDef.slug,
				description: catDef.description,
				active: true,
				parent: parentId,
				attributes: catDef.attributes,
			},
		});

		slugToId[catDef.slug] = result.id;
		createdCategories.push(result);
	}

	return createdCategories;
};
