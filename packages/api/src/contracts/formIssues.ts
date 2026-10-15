/**
 * One refusal pinned to one field. `path` is dot-separated in the shape of the
 * request body ("title", "variants.2.price", "attributes.brand"), so a client
 * can put the message under the input that holds the value and send the
 * seller back to the step that shows it.
 */
export interface FieldIssue {
	path: string;
	rule: string;
	params?: Record<string, string | number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asIssue(value: unknown): FieldIssue | null {
	if (!isRecord(value)) return null;
	const path =
		typeof value.path === "string"
			? value.path
			: typeof value.field === "string"
				? value.field
				: null;
	if (!path) return null;
	const rule = typeof value.rule === "string" ? value.rule : "invalid";
	const params = isRecord(value.params)
		? Object.fromEntries(
				Object.entries(value.params).filter(
					(entry): entry is [string, string | number] =>
						typeof entry[1] === "string" || typeof entry[1] === "number",
				),
			)
		: undefined;
	return params ? { path, rule, params } : { path, rule };
}

/**
 * Field issues out of any error body the API sends: a service refusal
 * (`{ code, details: { issues } }`) or a Payload ValidationError
 * (`{ errors: [{ data: { errors: [{ path, message }] } }] }`). Anything else
 * yields nothing, and the caller falls back to its generic message.
 */
export function issuesFromErrorBody(body: unknown): FieldIssue[] {
	if (!isRecord(body)) return [];
	const found: FieldIssue[] = [];
	const details = isRecord(body.details) ? body.details : null;
	if (details && Array.isArray(details.issues)) {
		for (const entry of details.issues) {
			const issue = asIssue(entry);
			if (issue) found.push(issue);
		}
	}
	if (Array.isArray(body.errors)) {
		for (const error of body.errors) {
			if (!isRecord(error)) continue;
			const data = isRecord(error.data) ? error.data : null;
			if (data && Array.isArray(data.errors)) {
				for (const entry of data.errors) {
					const issue = asIssue(entry);
					if (issue) found.push(issue);
				}
				continue;
			}
			const issue = asIssue(error);
			if (issue) found.push(issue);
		}
	}
	return found;
}

export function issueAt(
	issues: readonly FieldIssue[],
	path: string,
): FieldIssue | undefined {
	return issues.find((issue) => issue.path === path);
}

/** The issue on `prefix` itself or on any path below it. */
export function issueUnder(
	issues: readonly FieldIssue[],
	prefix: string,
): FieldIssue | undefined {
	return issues.find(
		(issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`),
	);
}

/** The earliest step, in `order`, that holds one of the issues. */
export function firstIssueStep<S extends string>(
	issues: readonly FieldIssue[],
	stepOf: (path: string) => S | null,
	order: readonly S[],
): S | null {
	const steps = new Set(
		issues.map((issue) => stepOf(issue.path)).filter(Boolean),
	);
	return order.find((step) => steps.has(step)) ?? null;
}
