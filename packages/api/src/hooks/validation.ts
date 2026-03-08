import type { CategoryAttribute } from "../collections/Categories";

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
			collection: string;
			id: string;
			depth: number;
		}) => Promise<{
			attributes?: Array<{
				name: string;
				slug: string;
				type: string;
				required: boolean;
				options?: unknown[];
			}>;
		}>;
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
			case "text":
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
