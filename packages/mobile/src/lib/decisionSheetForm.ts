import { z } from "zod";

export interface DecisionSchemaOptions {
	/** Whether the sheet offers a reason picker at all. */
	needsChoice: boolean;
	/** Whether the sheet offers a duration picker at all. */
	needsDuration: boolean;
	/** A lone duration option is not really a choice — it must not block. */
	singleDuration: boolean;
	/** Whether the free-text field must be filled before confirming. */
	textRequired: boolean;
}

/**
 * One reusable schema for every `DecisionSheet` instance: reject, suspend,
 * revoke and friends all collect some mix of a reason, a duration and a
 * free-text note, and which of those are required varies per action — so
 * the schema is built from the same flags `DecisionSheet` already derives
 * from its props, rather than hand-written validation per field.
 */
export function buildDecisionSchema(options: DecisionSchemaOptions) {
	return z
		.object({
			choice: z.string().nullable(),
			duration: z.number().nullable(),
			text: z.string(),
		})
		.superRefine((values, ctx) => {
			if (options.needsChoice && values.choice === null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["choice"],
					message: "moderation.decisionChoiceRequired",
				});
			}
			if (
				options.needsDuration &&
				!options.singleDuration &&
				values.duration === null
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["duration"],
					message: "moderation.decisionDurationRequired",
				});
			}
			if (options.textRequired && values.text.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["text"],
					message: "moderation.decisionTextRequired",
				});
			}
		});
}

export type DecisionFormValues = z.infer<
	ReturnType<typeof buildDecisionSchema>
>;

/**
 * A single duration option is auto-selected on open — it is not really a
 * choice, so the moderator should not have to tap it for the sheet to
 * become ready. Anything else starts unset: reopening must not inherit
 * whatever the previous decision had picked.
 */
export function decisionSheetDefaults(
	singleDuration: boolean,
	singleDurationValue: number | null,
): DecisionFormValues {
	return {
		choice: null,
		duration: singleDuration ? singleDurationValue : null,
		text: "",
	};
}
