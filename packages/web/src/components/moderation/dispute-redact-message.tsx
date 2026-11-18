"use client";

import { useTranslations } from "next-intl";
import { useModerationDisputeAction } from "~/hooks/use-moderation-disputes";
import { resolveErrorMessage } from "~/lib/apiError";
import { redactAction } from "~/lib/moderation-dispute-notes";
import { ConfirmNoteAction } from "./dispute-confirm-note";

export function RedactMessageControl({
	disputeId,
	messageId,
}: {
	disputeId: string;
	messageId: string;
}) {
	const t = useTranslations("ModerationDisputes");
	const tRoot = useTranslations();
	const action = useModerationDisputeAction(disputeId);
	return (
		<div className="mt-2">
			<ConfirmNoteAction
				label={t("redactMessage")}
				noteLabel={t("redactNoteLabel")}
				confirmLabel={t("redactConfirm")}
				pending={action.isPending}
				onConfirm={(note, done) =>
					action.mutate(redactAction(messageId, note), { onSuccess: done })
				}
			/>
			{action.isError ? (
				<p role="alert" className="mt-1 text-red-700 text-xs">
					{resolveErrorMessage(action.error, tRoot)}
				</p>
			) : null}
		</div>
	);
}
