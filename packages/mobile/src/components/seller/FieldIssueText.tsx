import { Text } from "react-native";
import { type FieldIssue, issueMessage } from "@/src/lib/formIssues";
import { useTranslation } from "@/src/lib/i18n";
import { formStyles as f } from "./formStyles";

/** The message under a field the server would refuse; nothing when it is fine. */
export function FieldIssueText({ issue }: { issue: FieldIssue | undefined }) {
	const { t } = useTranslation();
	if (!issue) return null;
	return (
		<Text style={f.error} accessibilityRole="alert">
			{issueMessage(t, issue)}
		</Text>
	);
}

export const ISSUE_BORDER = "#dc2626";
