import {
	type FieldIssue,
	issuesFromErrorBody,
} from "../../../api/src/contracts/formIssues";

export type { FieldIssue } from "../../../api/src/contracts/formIssues";
export { issueAt, issueUnder } from "../../../api/src/contracts/formIssues";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Rules whose wording depends on the field they sit on. */
const PER_FIELD: Record<string, string> = {
	"variants:count": "formIssues.variantsCount",
	"variants:single": "formIssues.variantsSingle",
	"options:required": "formIssues.optionsRequired",
	"options:maxItems": "formIssues.optionsMax",
	"values:count": "formIssues.valuesCount",
	"title:length": "formIssues.length",
};

/** A translated sentence for one issue, worded for the field it is on. */
export function issueMessage(t: Translate, issue: FieldIssue): string {
	const field = issue.path
		.split(".")
		.filter((part) => !/^\d+$/.test(part))
		.pop();
	const key =
		PER_FIELD[`${issue.path}:${issue.rule}`] ??
		PER_FIELD[`${field}:${issue.rule}`] ??
		`formIssues.${issue.rule}`;
	const text = t(key, issue.params);
	return text === key ? t("formIssues.invalid") : text;
}

/**
 * The field issues a failed save came back with: the service's
 * `details.issues`, a Payload ValidationError's paths, or the category the
 * server could not find. Empty when the refusal is not about a field.
 */
export function serverFieldIssues(error: unknown): FieldIssue[] {
	if (typeof error !== "object" || error === null) return [];
	const { data, code } = error as { data?: unknown; code?: unknown };
	const issues = issuesFromErrorBody(data);
	if (issues.length === 0 && code === "listing.categoryNotFound") {
		return [{ path: "category", rule: "notFound" }];
	}
	return issues;
}
