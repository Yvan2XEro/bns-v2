import type { File } from "payload";

interface CategoryData {
	name: string;
	slug: string;
	description: string;
	icon?: string;
	imageUrl?: string;
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
	// ─── Top-level: Vehicles ───
	{
		name: "Vehicles",
		slug: "vehicles",
		description: "Cars, motorcycles, trucks, and other vehicles",
		icon: "car",
		imageUrl:
			"https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop",
		attributes: [],
	},
	{
		name: "Cars",
		slug: "cars",
		description: "Used and new cars for sale",
		icon: "car-front",
		imageUrl:
			"https://images.unsplash.com/photo-1549924231-f129b911e442?w=800&h=600&fit=crop",
		parent: "vehicles",
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
					{ value: "Volkswagen" },
					{ value: "Audi" },
					{ value: "Peugeot" },
					{ value: "Renault" },
					{ value: "Hyundai" },
					{ value: "Kia" },
					{ value: "Nissan" },
					{ value: "Other" },
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
				name: "Mileage (km)",
				slug: "mileage",
				type: "number",
				required: true,
				filterable: true,
			},
			{
				name: "Fuel Type",
				slug: "fuel-type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Petrol" },
					{ value: "Diesel" },
					{ value: "Electric" },
					{ value: "Hybrid" },
					{ value: "LPG" },
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
			{
				name: "Color",
				slug: "color",
				type: "select",
				required: false,
				filterable: true,
				options: [
					{ value: "Black" },
					{ value: "White" },
					{ value: "Silver" },
					{ value: "Grey" },
					{ value: "Red" },
					{ value: "Blue" },
					{ value: "Other" },
				],
			},
		],
	},
	{
		name: "Motorcycles",
		slug: "motorcycles",
		description: "Motorcycles, scooters, and ATVs",
		icon: "bike",
		imageUrl:
			"https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=800&h=600&fit=crop",
		parent: "vehicles",
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
					{ value: "Suzuki" },
					{ value: "BMW" },
					{ value: "Ducati" },
					{ value: "Harley-Davidson" },
					{ value: "Other" },
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
				name: "Engine Size (cc)",
				slug: "engine-size",
				type: "number",
				required: true,
				filterable: true,
			},
			{
				name: "Mileage (km)",
				slug: "mileage",
				type: "number",
				required: false,
				filterable: true,
			},
		],
	},
	{
		name: "Trucks & Utility",
		slug: "trucks-utility",
		description: "Trucks, vans, and utility vehicles",
		icon: "truck",
		imageUrl:
			"https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=800&h=600&fit=crop",
		parent: "vehicles",
		attributes: [
			{
				name: "Type",
				slug: "type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Truck" },
					{ value: "Van" },
					{ value: "Pickup" },
					{ value: "Bus" },
					{ value: "Other" },
				],
			},
			{
				name: "Year",
				slug: "year",
				type: "number",
				required: true,
				filterable: true,
			},
			{
				name: "Mileage (km)",
				slug: "mileage",
				type: "number",
				required: true,
				filterable: true,
			},
			{
				name: "Payload Capacity (tons)",
				slug: "payload-capacity",
				type: "number",
				required: false,
				filterable: true,
			},
		],
	},

	// ─── Top-level: Real Estate ───
	{
		name: "Real Estate",
		slug: "real-estate",
		description: "Properties for sale and rent",
		icon: "home",
		imageUrl:
			"https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&h=600&fit=crop",
		attributes: [],
	},
	{
		name: "Apartments",
		slug: "apartments",
		description: "Apartments and flats for sale or rent",
		icon: "building",
		imageUrl:
			"https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&h=600&fit=crop",
		parent: "real-estate",
		attributes: [
			{
				name: "Transaction Type",
				slug: "transaction-type",
				type: "select",
				required: true,
				filterable: true,
				options: [{ value: "Sale" }, { value: "Rent" }],
			},
			{
				name: "Surface (m²)",
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
				name: "Floor",
				slug: "floor",
				type: "number",
				required: false,
				filterable: false,
			},
			{
				name: "Furnished",
				slug: "furnished",
				type: "boolean",
				required: false,
				filterable: true,
			},
			{
				name: "Elevator",
				slug: "elevator",
				type: "boolean",
				required: false,
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
	},
	{
		name: "Houses & Villas",
		slug: "houses",
		description: "Houses, villas, and townhouses",
		icon: "house",
		imageUrl:
			"https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&h=600&fit=crop",
		parent: "real-estate",
		attributes: [
			{
				name: "Transaction Type",
				slug: "transaction-type",
				type: "select",
				required: true,
				filterable: true,
				options: [{ value: "Sale" }, { value: "Rent" }],
			},
			{
				name: "Surface (m²)",
				slug: "surface",
				type: "number",
				required: true,
				filterable: true,
			},
			{
				name: "Land Area (m²)",
				slug: "land-area",
				type: "number",
				required: false,
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
				name: "Garage",
				slug: "garage",
				type: "boolean",
				required: false,
				filterable: true,
			},
			{
				name: "Garden",
				slug: "garden",
				type: "boolean",
				required: false,
				filterable: true,
			},
			{
				name: "Pool",
				slug: "pool",
				type: "boolean",
				required: false,
				filterable: true,
			},
		],
	},
	{
		name: "Commercial Property",
		slug: "commercial-property",
		description: "Offices, shops, and commercial spaces",
		icon: "store",
		imageUrl:
			"https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=600&fit=crop",
		parent: "real-estate",
		attributes: [
			{
				name: "Transaction Type",
				slug: "transaction-type",
				type: "select",
				required: true,
				filterable: true,
				options: [{ value: "Sale" }, { value: "Rent" }],
			},
			{
				name: "Property Type",
				slug: "property-type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Office" },
					{ value: "Shop" },
					{ value: "Warehouse" },
					{ value: "Restaurant" },
					{ value: "Other" },
				],
			},
			{
				name: "Surface (m²)",
				slug: "surface",
				type: "number",
				required: true,
				filterable: true,
			},
		],
	},
	{
		name: "Land",
		slug: "land",
		description: "Agricultural and building land",
		icon: "mountain",
		imageUrl:
			"https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&h=600&fit=crop",
		parent: "real-estate",
		attributes: [
			{
				name: "Land Type",
				slug: "land-type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Building Land" },
					{ value: "Agricultural" },
					{ value: "Industrial" },
				],
			},
			{
				name: "Area (m²)",
				slug: "area",
				type: "number",
				required: true,
				filterable: true,
			},
		],
	},

	// ─── Top-level: Electronics ───
	{
		name: "Electronics",
		slug: "electronics",
		description: "Phones, computers, TVs, and gadgets",
		icon: "cpu",
		imageUrl:
			"https://images.unsplash.com/photo-1498049794561-7780e7231661?w=800&h=600&fit=crop",
		attributes: [],
	},
	{
		name: "Phones & Tablets",
		slug: "phones",
		description: "Mobile phones, smartphones, and tablets",
		icon: "smartphone",
		imageUrl:
			"https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&h=600&fit=crop",
		parent: "electronics",
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
					{ value: "Xiaomi" },
					{ value: "Huawei" },
					{ value: "OnePlus" },
					{ value: "Other" },
				],
			},
			{
				name: "Storage",
				slug: "storage",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "32GB" },
					{ value: "64GB" },
					{ value: "128GB" },
					{ value: "256GB" },
					{ value: "512GB" },
					{ value: "1TB" },
				],
			},
			{
				name: "Condition",
				slug: "condition",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "New" },
					{ value: "Like New" },
					{ value: "Good" },
					{ value: "Fair" },
				],
			},
		],
	},
	{
		name: "Computers",
		slug: "computers",
		description: "Laptops, desktops, and accessories",
		icon: "laptop",
		imageUrl:
			"https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&h=600&fit=crop",
		parent: "electronics",
		attributes: [
			{
				name: "Type",
				slug: "type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Laptop" },
					{ value: "Desktop" },
					{ value: "All-in-One" },
					{ value: "Mini PC" },
				],
			},
			{
				name: "Brand",
				slug: "brand",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Apple" },
					{ value: "Dell" },
					{ value: "HP" },
					{ value: "Lenovo" },
					{ value: "Asus" },
					{ value: "Acer" },
					{ value: "MSI" },
					{ value: "Other" },
				],
			},
			{
				name: "RAM",
				slug: "ram",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "4GB" },
					{ value: "8GB" },
					{ value: "16GB" },
					{ value: "32GB" },
					{ value: "64GB" },
				],
			},
			{
				name: "Storage",
				slug: "storage",
				type: "select",
				required: false,
				filterable: true,
				options: [
					{ value: "128GB SSD" },
					{ value: "256GB SSD" },
					{ value: "512GB SSD" },
					{ value: "1TB SSD" },
					{ value: "1TB HDD" },
					{ value: "2TB HDD" },
				],
			},
			{
				name: "Condition",
				slug: "condition",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "New" },
					{ value: "Like New" },
					{ value: "Good" },
					{ value: "Fair" },
				],
			},
		],
	},
	{
		name: "TVs & Monitors",
		slug: "tvs-monitors",
		description: "Televisions, monitors, and screens",
		icon: "monitor",
		imageUrl:
			"https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=800&h=600&fit=crop",
		parent: "electronics",
		attributes: [
			{
				name: "Brand",
				slug: "brand",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Samsung" },
					{ value: "LG" },
					{ value: "Sony" },
					{ value: "TCL" },
					{ value: "Other" },
				],
			},
			{
				name: "Screen Size (inches)",
				slug: "screen-size",
				type: "number",
				required: true,
				filterable: true,
			},
			{
				name: "Resolution",
				slug: "resolution",
				type: "select",
				required: false,
				filterable: true,
				options: [
					{ value: "HD" },
					{ value: "Full HD" },
					{ value: "4K" },
					{ value: "8K" },
				],
			},
			{
				name: "Smart TV",
				slug: "smart-tv",
				type: "boolean",
				required: false,
				filterable: true,
			},
		],
	},
	{
		name: "Gaming",
		slug: "gaming",
		description: "Consoles, video games, and gaming accessories",
		icon: "gamepad-2",
		imageUrl:
			"https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=800&h=600&fit=crop",
		parent: "electronics",
		attributes: [
			{
				name: "Platform",
				slug: "platform",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "PlayStation 5" },
					{ value: "Xbox Series X" },
					{ value: "Nintendo Switch" },
					{ value: "PC" },
					{ value: "Other" },
				],
			},
			{
				name: "Item Type",
				slug: "item-type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Console" },
					{ value: "Game" },
					{ value: "Accessory" },
					{ value: "Bundle" },
				],
			},
			{
				name: "Condition",
				slug: "condition",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "New" },
					{ value: "Like New" },
					{ value: "Good" },
					{ value: "Fair" },
				],
			},
		],
	},

	// ─── Top-level: Home & Garden ───
	{
		name: "Home & Garden",
		slug: "home-garden",
		description: "Furniture, appliances, and garden equipment",
		icon: "sofa",
		imageUrl:
			"https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=800&h=600&fit=crop",
		attributes: [],
	},
	{
		name: "Furniture",
		slug: "furniture",
		description: "Sofas, beds, tables, and chairs",
		icon: "armchair",
		imageUrl:
			"https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&h=600&fit=crop",
		parent: "home-garden",
		attributes: [
			{
				name: "Furniture Type",
				slug: "furniture-type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Sofa" },
					{ value: "Bed" },
					{ value: "Table" },
					{ value: "Chair" },
					{ value: "Wardrobe" },
					{ value: "Desk" },
					{ value: "Shelf" },
					{ value: "Other" },
				],
			},
			{
				name: "Material",
				slug: "material",
				type: "select",
				required: false,
				filterable: true,
				options: [
					{ value: "Wood" },
					{ value: "Metal" },
					{ value: "Fabric" },
					{ value: "Leather" },
					{ value: "Plastic" },
					{ value: "Glass" },
				],
			},
			{
				name: "Condition",
				slug: "condition",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "New" },
					{ value: "Like New" },
					{ value: "Good" },
					{ value: "Fair" },
				],
			},
		],
	},
	{
		name: "Appliances",
		slug: "appliances",
		description: "Kitchen and household appliances",
		icon: "refrigerator",
		imageUrl:
			"https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=800&h=600&fit=crop",
		parent: "home-garden",
		attributes: [
			{
				name: "Appliance Type",
				slug: "appliance-type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Refrigerator" },
					{ value: "Washing Machine" },
					{ value: "Oven" },
					{ value: "Dishwasher" },
					{ value: "Air Conditioner" },
					{ value: "Microwave" },
					{ value: "Vacuum" },
					{ value: "Other" },
				],
			},
			{
				name: "Brand",
				slug: "brand",
				type: "select",
				required: false,
				filterable: true,
				options: [
					{ value: "Samsung" },
					{ value: "LG" },
					{ value: "Bosch" },
					{ value: "Whirlpool" },
					{ value: "Other" },
				],
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
	{
		name: "Garden & DIY",
		slug: "garden-diy",
		description: "Garden tools, plants, and DIY supplies",
		icon: "flower",
		imageUrl:
			"https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&h=600&fit=crop",
		parent: "home-garden",
		attributes: [
			{
				name: "Category",
				slug: "sub-category",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Tools" },
					{ value: "Plants" },
					{ value: "Outdoor Furniture" },
					{ value: "Lawn Mower" },
					{ value: "Decoration" },
					{ value: "Other" },
				],
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

	// ─── Top-level: Fashion ───
	{
		name: "Fashion & Clothing",
		slug: "fashion",
		description: "Clothing, shoes, and accessories",
		icon: "shirt",
		imageUrl:
			"https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=600&fit=crop",
		attributes: [],
	},
	{
		name: "Men's Clothing",
		slug: "mens-clothing",
		description: "Shirts, pants, jackets, and more for men",
		icon: "shirt",
		imageUrl:
			"https://images.unsplash.com/photo-1507680434567-5739c80be1ac?w=800&h=600&fit=crop",
		parent: "fashion",
		attributes: [
			{
				name: "Clothing Type",
				slug: "clothing-type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "T-Shirt" },
					{ value: "Shirt" },
					{ value: "Pants" },
					{ value: "Jacket" },
					{ value: "Suit" },
					{ value: "Shoes" },
					{ value: "Other" },
				],
			},
			{
				name: "Size",
				slug: "size",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "XS" },
					{ value: "S" },
					{ value: "M" },
					{ value: "L" },
					{ value: "XL" },
					{ value: "XXL" },
				],
			},
			{
				name: "Condition",
				slug: "condition",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "New with Tags" },
					{ value: "Like New" },
					{ value: "Good" },
					{ value: "Fair" },
				],
			},
		],
	},
	{
		name: "Women's Clothing",
		slug: "womens-clothing",
		description: "Dresses, tops, pants, and more for women",
		icon: "shirt",
		imageUrl:
			"https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&h=600&fit=crop",
		parent: "fashion",
		attributes: [
			{
				name: "Clothing Type",
				slug: "clothing-type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Dress" },
					{ value: "Top" },
					{ value: "Pants" },
					{ value: "Skirt" },
					{ value: "Jacket" },
					{ value: "Shoes" },
					{ value: "Other" },
				],
			},
			{
				name: "Size",
				slug: "size",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "XS" },
					{ value: "S" },
					{ value: "M" },
					{ value: "L" },
					{ value: "XL" },
					{ value: "XXL" },
				],
			},
			{
				name: "Condition",
				slug: "condition",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "New with Tags" },
					{ value: "Like New" },
					{ value: "Good" },
					{ value: "Fair" },
				],
			},
		],
	},
	{
		name: "Watches & Jewelry",
		slug: "watches-jewelry",
		description: "Watches, rings, necklaces, and bracelets",
		icon: "watch",
		imageUrl:
			"https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800&h=600&fit=crop",
		parent: "fashion",
		attributes: [
			{
				name: "Item Type",
				slug: "item-type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Watch" },
					{ value: "Ring" },
					{ value: "Necklace" },
					{ value: "Bracelet" },
					{ value: "Earrings" },
					{ value: "Other" },
				],
			},
			{
				name: "Material",
				slug: "material",
				type: "select",
				required: false,
				filterable: true,
				options: [
					{ value: "Gold" },
					{ value: "Silver" },
					{ value: "Stainless Steel" },
					{ value: "Leather" },
					{ value: "Other" },
				],
			},
			{
				name: "Condition",
				slug: "condition",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "New" },
					{ value: "Like New" },
					{ value: "Good" },
					{ value: "Fair" },
				],
			},
		],
	},

	// ─── Top-level: Jobs & Services ───
	{
		name: "Jobs & Services",
		slug: "jobs-services",
		description: "Job offers, freelance services, and professional help",
		icon: "briefcase",
		imageUrl:
			"https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&h=600&fit=crop",
		attributes: [],
	},
	{
		name: "Job Offers",
		slug: "job-offers",
		description: "Full-time and part-time job opportunities",
		icon: "briefcase",
		imageUrl:
			"https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&h=600&fit=crop",
		parent: "jobs-services",
		attributes: [
			{
				name: "Industry",
				slug: "industry",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "IT & Tech" },
					{ value: "Sales" },
					{ value: "Marketing" },
					{ value: "Healthcare" },
					{ value: "Education" },
					{ value: "Construction" },
					{ value: "Hospitality" },
					{ value: "Other" },
				],
			},
			{
				name: "Contract Type",
				slug: "contract-type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Full-time" },
					{ value: "Part-time" },
					{ value: "Freelance" },
					{ value: "Internship" },
					{ value: "Temporary" },
				],
			},
			{
				name: "Experience Level",
				slug: "experience-level",
				type: "select",
				required: false,
				filterable: true,
				options: [
					{ value: "Entry Level" },
					{ value: "Mid Level" },
					{ value: "Senior" },
					{ value: "Executive" },
				],
			},
		],
	},
	{
		name: "Services",
		slug: "services",
		description: "Professional and personal services",
		icon: "wrench",
		imageUrl:
			"https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&h=600&fit=crop",
		parent: "jobs-services",
		attributes: [
			{
				name: "Service Type",
				slug: "service-type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Plumbing" },
					{ value: "Electrical" },
					{ value: "Cleaning" },
					{ value: "Moving" },
					{ value: "Tutoring" },
					{ value: "IT Support" },
					{ value: "Beauty" },
					{ value: "Other" },
				],
			},
			{
				name: "Available Weekends",
				slug: "available-weekends",
				type: "boolean",
				required: false,
				filterable: true,
			},
		],
	},

	// ─── Top-level: Leisure ───
	{
		name: "Leisure & Sports",
		slug: "leisure-sports",
		description: "Sports equipment, hobbies, and entertainment",
		icon: "dumbbell",
		imageUrl:
			"https://images.unsplash.com/photo-1461896836934-bd45ba3bdb78?w=800&h=600&fit=crop",
		attributes: [],
	},
	{
		name: "Sports Equipment",
		slug: "sports-equipment",
		description: "Fitness gear, bikes, and sports accessories",
		icon: "dumbbell",
		imageUrl:
			"https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&h=600&fit=crop",
		parent: "leisure-sports",
		attributes: [
			{
				name: "Sport",
				slug: "sport",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Football" },
					{ value: "Basketball" },
					{ value: "Tennis" },
					{ value: "Swimming" },
					{ value: "Cycling" },
					{ value: "Running" },
					{ value: "Gym & Fitness" },
					{ value: "Other" },
				],
			},
			{
				name: "Condition",
				slug: "condition",
				type: "select",
				required: true,
				filterable: true,
				options: [{ value: "New" }, { value: "Like New" }, { value: "Used" }],
			},
		],
	},
	{
		name: "Books & Media",
		slug: "books-media",
		description: "Books, music, movies, and collectibles",
		icon: "book-open",
		imageUrl:
			"https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=800&h=600&fit=crop",
		parent: "leisure-sports",
		attributes: [
			{
				name: "Media Type",
				slug: "media-type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Book" },
					{ value: "Vinyl / CD" },
					{ value: "DVD / Blu-ray" },
					{ value: "Musical Instrument" },
					{ value: "Other" },
				],
			},
			{
				name: "Condition",
				slug: "condition",
				type: "select",
				required: true,
				filterable: true,
				options: [{ value: "New" }, { value: "Like New" }, { value: "Good" }],
			},
		],
	},
	{
		name: "Travel & Vacation",
		slug: "travel-vacation",
		description: "Holiday rentals, trips, and luggage",
		icon: "plane",
		imageUrl:
			"https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop",
		parent: "leisure-sports",
		attributes: [
			{
				name: "Listing Type",
				slug: "listing-type",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Holiday Rental" },
					{ value: "Travel Equipment" },
					{ value: "Tickets" },
					{ value: "Other" },
				],
			},
		],
	},

	// ─── Top-level: Kids & Baby ───
	{
		name: "Kids & Baby",
		slug: "kids-baby",
		description: "Toys, baby gear, and children's clothing",
		icon: "baby",
		imageUrl:
			"https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800&h=600&fit=crop",
		attributes: [
			{
				name: "Category",
				slug: "sub-category",
				type: "select",
				required: true,
				filterable: true,
				options: [
					{ value: "Toys" },
					{ value: "Baby Gear" },
					{ value: "Children's Clothing" },
					{ value: "Stroller" },
					{ value: "Car Seat" },
					{ value: "Other" },
				],
			},
			{
				name: "Age Range",
				slug: "age-range",
				type: "select",
				required: false,
				filterable: true,
				options: [
					{ value: "0-1 year" },
					{ value: "1-3 years" },
					{ value: "3-6 years" },
					{ value: "6-12 years" },
					{ value: "12+ years" },
				],
			},
			{
				name: "Condition",
				slug: "condition",
				type: "select",
				required: true,
				filterable: true,
				options: [{ value: "New" }, { value: "Like New" }, { value: "Good" }],
			},
		],
	},

	// ─── Top-level: Other ───
	{
		name: "Other",
		slug: "other",
		description: "Miscellaneous items and everything else",
		icon: "package",
		imageUrl:
			"https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=800&h=600&fit=crop",
		attributes: [
			{
				name: "Condition",
				slug: "condition",
				type: "select",
				required: false,
				filterable: true,
				options: [{ value: "New" }, { value: "Used" }],
			},
		],
	},
];

async function fetchFileByURL(url: string): Promise<File> {
	const res = await fetch(url, {
		method: "GET",
	});

	if (!res.ok) {
		throw new Error(`Failed to fetch file from ${url}, status: ${res.status}`);
	}

	const data = await res.arrayBuffer();
	const filename = url.split("/").pop()?.split("?")[0] || `image-${Date.now()}`;
	const ext = filename.split(".").pop() || "jpg";

	return {
		name: `category-${filename}`,
		data: Buffer.from(data),
		mimetype: `image/${ext === "jpg" ? "jpeg" : ext}`,
		size: data.byteLength,
	};
}

export const seedCategories = async (payload: unknown) => {
	const createdCategories: Array<{ id: string; slug: string }> = [];
	const slugToId: Record<string, string> = {};

	const typedPayload = payload as {
		create: (options: {
			collection: string;
			data: Record<string, unknown>;
			file?: File;
		}) => Promise<{ id: string; slug: string }>;
		logger?: { info: (msg: string) => void; error: (msg: string) => void };
	};

	for (const catDef of categoryDefinitions) {
		const parentId = catDef.parent ? slugToId[catDef.parent] : undefined;

		// Download and create media for the category image
		let imageId: string | undefined;
		if (catDef.imageUrl) {
			try {
				const fileBuffer = await fetchFileByURL(catDef.imageUrl);
				const mediaDoc = await typedPayload.create({
					collection: "media",
					data: {
						alt: `${catDef.name} category image`,
					},
					file: fileBuffer,
				});
				imageId = mediaDoc.id;
			} catch (err) {
				typedPayload.logger?.error?.(
					`Failed to download image for ${catDef.name}: ${err}`,
				);
			}
		}

		const result = await typedPayload.create({
			collection: "categories",
			data: {
				name: catDef.name,
				slug: catDef.slug,
				description: catDef.description,
				icon: catDef.icon,
				active: true,
				parent: parentId,
				image: imageId,
				attributes: catDef.attributes,
			},
		});

		slugToId[catDef.slug] = result.id;
		createdCategories.push(result);
	}

	return createdCategories;
};
