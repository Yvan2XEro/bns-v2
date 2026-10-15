"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	type AuthIssue,
	firstIssueField,
	type Issues,
	visibleIssues,
} from "~/lib/auth-form";

/**
 * Inline validation for an auth form: `blur` reveals a field's issue once it
 * holds a value, `check` reveals them all and focuses the first invalid
 * field, returning whether the form may be sent.
 */
export function useFieldIssues<F extends string>(
	values: Record<F, string>,
	validate: (values: Record<F, string>) => Issues<F>,
	order: readonly F[],
) {
	const t = useTranslations("Auth");
	const [shown, setShown] = useState<Partial<Record<F, boolean>>>({});
	const all = validate(values);
	const visible = visibleIssues(all, shown);

	return {
		error(field: F): string | undefined {
			const issue: AuthIssue | undefined = visible[field];
			return issue ? t(issue) : undefined;
		},
		blur(field: F) {
			if (values[field] !== "")
				setShown((s) => (s[field] ? s : { ...s, [field]: true }));
		},
		check(): boolean {
			setShown(
				Object.fromEntries(order.map((f) => [f, true])) as Record<F, boolean>,
			);
			const first = firstIssueField(all, order);
			if (first) document.getElementById(first)?.focus();
			return first === undefined;
		},
	};
}
