import {
	attributeIssueText,
	attributeValueIssues,
} from "../contracts/categoryAttributes";

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

	return attributeValueIssues(category.attributes, attributes).map((issue) => ({
		field: issue.slug,
		message: attributeIssueText(issue),
	}));
};
