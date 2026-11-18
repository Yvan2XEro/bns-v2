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
	// The mobile scanner sends one document per page, so a kind can hold
	// several; each is listed with its own delete, the upload slot stays for
	// a kind that has none yet.
	const documentsOf = (kind: DocumentKind) =>
		documents.filter((document) => document.kind === kind);

	const renderSlot = (kind: DocumentKind, required: boolean) => {
		const pages = documentsOf(kind);
		const label = t(`documentKind.${kind}`);
		if (pages.length === 0) {
			return (
				<DocumentSlot
					key={kind}
					label={label}
					required={required}
					document={null}
					uploading={uploadingKind === kind}
					deleting={false}
					error={uploadError?.kind === kind ? uploadError.message : null}
					onUpload={(file) => onUpload(kind, file)}
					onDelete={() => undefined}
				/>
			);
		}
		return pages.map((document, index) => (
			<DocumentSlot
				key={document.id}
				label={
					pages.length > 1
						? t("documents.pageOf", {
								label,
								page: index + 1,
								total: pages.length,
							})
						: label
				}
				required={required}
				document={document}
				uploading={uploadingKind === kind}
				deleting={deletingId === document.id}
				error={uploadError?.kind === kind ? uploadError.message : null}
				onUpload={(file) => onUpload(kind, file)}
				onDelete={() => onDelete(kind, document.id)}
			/>
		));
	};

	return (
		<div className="space-y-4">
			<div>
				<h3 className="mb-2 font-bold text-ink text-sm">
					{t("documents.title")}
				</h3>
				<div className="space-y-3">
					{kinds.map((kind) => renderSlot(kind, true))}
				</div>
			</div>
			<div>
				<h3 className="mb-2 font-bold text-ink text-sm">
					{t("documents.extrasTitle")}
				</h3>
				{renderSlot(EXTRA_KIND, false)}
			</div>
		</div>
	);
}
