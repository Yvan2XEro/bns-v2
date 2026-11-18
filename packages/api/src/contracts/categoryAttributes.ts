import type { FieldIssue } from "./formIssues";

/**
 * The server's rules for a category attribute's value, on the typed JSON a
 * client sends (a number as a number, a boolean as a boolean). The listing
 * hook, the product service and both clients run this one function.
 */
export interface AttributeRuleDef {
	slug: string;
	name?: string | null;
	type?: string | null;
	required?: boolean | null;
	options?: unknown;
	min?: number | string | null;
	max?: number | string | null;
}

export type AttributeRule =
	| "required"
	| "number"
	| "min"
	| "max"
	| "boolean"
	| "date"
	| "option"
	| "text";

export interface AttributeIssue extends FieldIssue {
	rule: AttributeRule;
	slug: string;
	name: string;
}

function optionValues(options: unknown): string[] {
	if (!Array.isArray(options)) return [];
	return options
		.map((option) => {
			if (typeof option === "string") return option;
			if (typeof option === "object" && option !== null) {
				const value = (option as Record<string, unknown>).value;
				if (typeof value === "string") return value;
			}
			return null;
		})
		.filter((value): value is string => value !== null);
}

function bound(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	return null;
}

const isEmpty = (value: unknown) =>
	value === undefined || value === null || value === "";

export function attributeValueIssues(
	defs: readonly AttributeRuleDef[] | null | undefined,
	values: Record<string, unknown> | null | undefined,
): AttributeIssue[] {
	const issues: AttributeIssue[] = [];
	for (const def of defs ?? []) {
		const value = values?.[def.slug];
		const name = def.name || def.slug;
		const push = (
			rule: AttributeRule,
			params?: Record<string, string | number>,
		) =>
			issues.push({
				path: `attributes.${def.slug}`,
				rule,
				slug: def.slug,
				name,
				...(params ? { params } : {}),
			});

		if (isEmpty(value)) {
			if (def.required) push("required");
			continue;
		}

		switch (def.type) {
			case "number": {
				if (typeof value !== "number") {
					push("number");
					break;
				}
				// Bounds are only enforced once an admin sets them, so attributes
				// defined before they existed keep accepting what they always did.
				const min = bound(def.min);
				const max = bound(def.max);
				if (min !== null && value < min) push("min", { min });
				if (max !== null && value > max) push("max", { max });
				break;
			}
			case "boolean":
				if (typeof value !== "boolean") push("boolean");
				break;
			case "date":
				if (typeof value !== "string" && !(value instanceof Date)) push("date");
				break;
			case "select": {
				const allowed = optionValues(def.options);
				if (allowed.length > 0 && !allowed.includes(String(value))) {
					push("option", { options: allowed.join(", ") });
				}
				break;
			}
			default:
				if (typeof value !== "string") push("text");
		}
	}
	return issues;
}

/** The English sentence the API has always logged and returned for an issue. */
export function attributeIssueText(issue: AttributeIssue): string {
	switch (issue.rule) {
		case "required":
			return `${issue.name} is required`;
		case "number":
			return `${issue.name} must be a number`;
		case "min":
			return `${issue.name} must be at least ${issue.params?.min}`;
		case "max":
			return `${issue.name} must be at most ${issue.params?.max}`;
		case "boolean":
			return `${issue.name} must be a boolean`;
		case "date":
			return `${issue.name} must be a date`;
		case "option":
			return `${issue.name} must be one of: ${issue.params?.options}`;
		default:
			return `${issue.name} must be a text`;
	}
}
