import type { AttributeRuleDef } from "../../../api/src/contracts/categoryAttributes";
import {
	type FieldIssue,
	issuesFromErrorBody,
} from "../../../api/src/contracts/formIssues";
import {
	type ListingPresetFields,
	type ListingStep,
	listingInputIssues,
	listingIssueStep,
} from "../../../api/src/contracts/listingValidation";

export type { FieldIssue } from "../../../api/src/contracts/formIssues";

/**
 * What `POST`/`PATCH /api/listings` would refuse in the body about to be
 * sent, run through the API's own rules, so the form stops on the step that
 * shows the field instead of failing at submit.
 */
export function webListingIssues(
	body: Record<string, unknown>,
	context: {
		preset: ListingPresetFields;
		attributes: readonly AttributeRuleDef[];
		previousImageCount?: number;
		/** Ids of the tags the category gets, once loaded. */
		tags?: readonly string[] | null;
	},
): FieldIssue[] {
	return listingInputIssues(body, context);
}

/** The first of `steps` that holds one of the issues. */
export function firstListingIssueStep<S extends ListingStep>(
	issues: readonly FieldIssue[],
	steps: readonly S[],
): S | null {
	return (
		steps.find((step) =>
			issues.some((issue) => listingIssueStep(issue.path) === step),
		) ?? null
	);
}

export function issuesOnStep(
	issues: readonly FieldIssue[],
	step: ListingStep,
): FieldIssue[] {
	return issues.filter((issue) => listingIssueStep(issue.path) === step);
}

/** The field issues out of a refused response; empty when the body says nothing about fields. */
export async function responseIssues(res: Response): Promise<FieldIssue[]> {
	try {
		return issuesFromErrorBody(await res.json());
	} catch {
		return [];
	}
}

const LABEL_KEYS: Record<string, string> = {
	title: "fieldTitle",
	description: "fieldDescription",
	category: "fieldCategory",
	price: "fieldPrice",
	location: "fieldLocation",
	images: "fieldImages",
	tags: "fieldTags",
};

/** The `FormIssues` key naming the field at `path`, or null for an attribute or an unknown field. */
export function issueLabelKey(path: string): string | null {
	return LABEL_KEYS[path.split(".")[0]] ?? null;
}

const RULE_KEYS = new Set([
	"required",
	"maxItems",
	"number",
	"option",
	"min",
	"max",
	"boolean",
	"date",
	"text",
	"notFound",
	"uploadFailed",
	"category",
]);

/** The `FormIssues` key wording the rule; anything unknown reads as "refused". */
export function issueRuleKey(rule: string): string {
	return RULE_KEYS.has(rule) ? `rule_${rule}` : "rule_invalid";
}
