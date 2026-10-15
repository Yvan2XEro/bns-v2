"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	type FieldIssue,
	issueLabelKey,
	issueRuleKey,
} from "~/lib/listing-issues";

/** The fields to fix on the current step, each named the way the form labels it. */
export function FieldIssueSummary({
	issues,
	attributeNames = {},
	refused = false,
}: {
	issues: FieldIssue[];
	attributeNames?: Record<string, string>;
	/** True when these came back from the server rather than from the form. */
	refused?: boolean;
}) {
	const t = useTranslations("FormIssues");
	if (issues.length === 0) return null;

	const labelOf = (path: string) => {
		if (path.startsWith("attributes.")) {
			const slug = path.slice("attributes.".length);
			return attributeNames[slug] ?? slug;
		}
		const key = issueLabelKey(path);
		return key ? t(key) : path;
	};

	return (
		<div
			role="alert"
			className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm"
		>
			<p className="font-medium">
				{refused ? t("serverRefused") : t("fixStep")}
			</p>
			{issues.map((issue) => (
				<p key={`${issue.path}:${issue.rule}`} className="flex gap-2">
					<CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
					<span>
						<span className="font-medium">{labelOf(issue.path)}</span> —{" "}
						{t(issueRuleKey(issue.rule), {
							min: issue.params?.min ?? "",
							max: issue.params?.max ?? "",
						})}
					</span>
				</p>
			))}
		</div>
	);
}
