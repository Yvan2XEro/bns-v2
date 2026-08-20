import type { CategoryAttribute } from "../collections/Categories";

type CategoryValidationShape = {
	attributes?: Array<{
		name: string;
		slug: string;
		type: string;
		required?: boolean | null;
		options?: unknown[] | null;
		unit?: string | null;
		group?: string | null;
		min?: number | null;
		max?: number | null;
	}> | null;
};

export interface ValidationError {
	field: string;
	message: string;
}

const getOptionsArray = (options: unknown): string[] => {
	if (!options || !Array.isArray(options)) return [];

	return options
		.map((opt) => {
			if (typeof opt === "string") return opt;
			if (typeof opt === "object" && opt !== null) {
				const obj = opt as Record<string, unknown>;
				if (typeof obj.value === "string") return obj.value;
			}
			return null;
		})
		.filter((v): v is string => v !== null);
};

export const validateListingAttributes = async ({
	attributes,
	categoryId,
	payload,
}: {
	attributes: Record<string, unknown> | undefined;
	categoryId: string;
	payload: {
		findByID: (options: {
			collection: "categories";
			id: string;
			depth: number;
		}) => Promise<CategoryValidationShape>;
	};
}): Promise<ValidationError[]> => {
	const errors: ValidationError[] = [];

	if (!categoryId) {
		return errors;
	}

	const category = await payload.findByID({
		collection: "categories",
		id: categoryId,
		depth: 0,
	});

	if (!category?.attributes || !Array.isArray(category.attributes)) {
		return errors;
	}

	const categoryAttributes =
		category.attributes as unknown as CategoryAttribute[];

	for (const attr of categoryAttributes) {
		const value = attributes?.[attr.slug];

		if (
			attr.required &&
			(value === undefined || value === null || value === "")
		) {
			errors.push({
				field: attr.slug,
				message: `${attr.name} is required`,
			});
			continue;
		}

		if (value === undefined || value === null || value === "") {
			continue;
		}

		const validOptions = getOptionsArray(attr.options);

		switch (attr.type) {
			case "number":
				if (typeof value !== "number") {
					errors.push({
						field: attr.slug,
						message: `${attr.name} must be a number`,
					});
					break;
				}
				// Bounds are optional and only enforced once an admin sets them, so
				// attributes defined before they existed keep accepting what they
				// always accepted.
				if (typeof attr.min === "number" && value < attr.min) {
					errors.push({
						field: attr.slug,
						message: `${attr.name} must be at least ${attr.min}`,
					});
				}
				if (typeof attr.max === "number" && value > attr.max) {
					errors.push({
						field: attr.slug,
						message: `${attr.name} must be at most ${attr.max}`,
					});
				}
				break;
			case "boolean":
				if (typeof value !== "boolean") {
					errors.push({
						field: attr.slug,
						message: `${attr.name} must be a boolean`,
					});
				}
				break;
			case "date":
				if (typeof value !== "string" && !(value instanceof Date)) {
					errors.push({
						field: attr.slug,
						message: `${attr.name} must be a date`,
					});
				}
				break;
			case "select":
				if (validOptions.length > 0 && !validOptions.includes(String(value))) {
					errors.push({
						field: attr.slug,
						message: `${attr.name} must be one of: ${validOptions.join(", ")}`,
					});
				}
				break;
			default:
				if (typeof value !== "string") {
					errors.push({
						field: attr.slug,
						message: `${attr.name} must be a text`,
					});
				}
		}
	}

	return errors;
};
