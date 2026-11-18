"use client";

import { useTranslations } from "next-intl";
import { type FieldIssue, productIssueKey } from "~/lib/product-form";

export type IssueAt = (path: string) => FieldIssue | null;

export function useProductIssueMessage() {
	const tIssue = useTranslations("ProductIssues");
	return (issue: FieldIssue) => tIssue(productIssueKey(issue), issue.params);
}

/** The refusal of one editor field, under the input that holds it. */
export function ProductIssueText({
	issue,
	id,
}: {
	issue: FieldIssue | null;
	id?: string;
}) {
	const message = useProductIssueMessage();
	if (!issue) return null;
	return (
		<p
			id={id}
			role="alert"
			data-field-issue=""
			className="mt-1 text-red-600 text-xs"
		>
			{message(issue)}
		</p>
	);
}
