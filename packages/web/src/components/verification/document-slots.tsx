"use client";

import { useTranslations } from "next-intl";
import type { UploadedVerificationDocument } from "~/hooks/use-verification";
import type { DocumentKind } from "~/lib/verification";
import { DocumentSlot } from "./document-slot";

/** The one extra slot every request may fill in beyond its required kinds. */
const EXTRA_KIND: DocumentKind = "other";

export interface DocumentSlotsProps {
	kinds: DocumentKind[];
	documents: UploadedVerificationDocument[];
	uploadingKind: DocumentKind | null;
	deletingId: string | null;
	uploadError: { kind: DocumentKind; message: string } | null;
	onUpload: (kind: DocumentKind, file: File) => void;
	onDelete: (kind: DocumentKind, docId: string) => void;
}

/** One `DocumentSlot` per required kind, plus the optional extras slot. */
export function DocumentSlots({
	kinds,
	documents,
	uploadingKind,
	deletingId,
	uploadError,
	onUpload,
	onDelete,
}: DocumentSlotsProps) {
	const t = useTranslations("Verification");
	const documentFor = (kind: DocumentKind) =>
		documents.find((document) => document.kind === kind) ?? null;

	const renderSlot = (kind: DocumentKind, required: boolean) => {
		const document = documentFor(kind);
		return (
			<DocumentSlot
				key={kind}
				label={t(`documentKind.${kind}`)}
				required={required}
				document={document}
				uploading={uploadingKind === kind}
				deleting={Boolean(document && deletingId === document.id)}
				error={uploadError?.kind === kind ? uploadError.message : null}
				onUpload={(file) => onUpload(kind, file)}
				onDelete={() => document && onDelete(kind, document.id)}
			/>
		);
	};

	return (
		<div className="space-y-4">
			<div>
				<h3 className="mb-2 font-bold text-[#0F172A] text-sm">
					{t("documents.title")}
				</h3>
				<div className="space-y-3">
					{kinds.map((kind) => renderSlot(kind, true))}
				</div>
			</div>
			<div>
				<h3 className="mb-2 font-bold text-[#0F172A] text-sm">
					{t("documents.extrasTitle")}
				</h3>
				{renderSlot(EXTRA_KIND, false)}
			</div>
		</div>
	);
}
