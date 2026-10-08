"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { useUploadReturnEvidence } from "~/hooks/use-returns";
import { resolveErrorMessage } from "~/lib/apiError";

export function ReturnEvidenceUpload({
	caseId,
	kind,
	evidenceIds,
	onChange,
}: {
	caseId: string;
	kind: "photo" | "payment_proof";
	evidenceIds: string[];
	onChange: (ids: string[]) => void;
}) {
	const id = useId();
	const t = useTranslations("Returns");
	const tRoot = useTranslations();
	const upload = useUploadReturnEvidence(caseId);
	return (
		<div className="space-y-2">
			<label htmlFor={id} className="block font-medium text-sm">
				{t("evidenceUpload")}
			</label>
			<input
				id={id}
				type="file"
				accept="image/jpeg,image/png,image/webp,image/heic"
				disabled={upload.isPending || evidenceIds.length >= 10}
				className="block min-h-11 w-full text-sm"
				onChange={(event) => {
					const file = event.currentTarget.files?.[0];
					if (file)
						upload.mutate(
							{ file, kind },
							{ onSuccess: (result) => onChange([...evidenceIds, result.id]) },
						);
					event.currentTarget.value = "";
				}}
			/>
			{upload.isPending ? (
				<output className="text-[#64748B] text-sm">
					{t("evidenceUploading")}
				</output>
			) : null}
			{evidenceIds.length ? (
				<p className="text-green-700 text-sm">
					{t("evidenceCount", { count: evidenceIds.length })}
				</p>
			) : null}
			{evidenceIds.map((evidenceId, index) => (
				<button
					key={evidenceId}
					type="button"
					onClick={() =>
						onChange(evidenceIds.filter((item) => item !== evidenceId))
					}
					className="mr-2 min-h-11 text-red-700 text-sm underline"
				>
					{t("removeEvidence", { number: index + 1 })}
				</button>
			))}
			{upload.isError ? (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(upload.error, tRoot)}
				</p>
			) : null}
		</div>
	);
}
