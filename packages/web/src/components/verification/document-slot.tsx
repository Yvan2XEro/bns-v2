"use client";

import { FileText, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import type { UploadedVerificationDocument } from "~/hooks/use-verification";
import {
	ACCEPTED_DOCUMENT_MIME_TYPES,
	validateDocumentFile,
} from "~/lib/verification-business";

export interface DocumentSlotProps {
	label: string;
	required: boolean;
	document: UploadedVerificationDocument | null;
	uploading: boolean;
	deleting: boolean;
	/** Set by the parent from `validateDocumentFile` or the server's own refusal. */
	error: string | null;
	onUpload: (file: File) => void;
	onDelete: () => void;
}

/** One required (or extra) document: a dropzone, a picked-file chip, or a
 * confirm-before-delete pair — never a modal for a decision this small. */
export function DocumentSlot({
	label,
	required,
	document,
	uploading,
	deleting,
	error,
	onUpload,
	onDelete,
}: DocumentSlotProps) {
	const t = useTranslations("Verification.documents");
	const tErrors = useTranslations("ApiErrors");
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragOver, setDragOver] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [localError, setLocalError] = useState<string | null>(null);

	const pick = (file: File | undefined) => {
		if (!file) return;
		const failure = validateDocumentFile(file);
		if (failure) {
			setLocalError(
				tErrors(
					failure === "uploadInvalidType"
						? "upload.invalidType"
						: "upload.tooLarge",
				),
			);
			return;
		}
		setLocalError(null);
		onUpload(file);
	};

	const busy = uploading || deleting;
	const message = localError ?? error;

	return (
		<div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
			<div className="mb-2 flex items-center justify-between gap-2">
				<span className="font-medium text-[#0F172A] text-sm">
					{label}
					{required && <span className="ml-1 text-red-500">*</span>}
				</span>
				{document && !confirming && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={busy}
						onClick={() => setConfirming(true)}
					>
						<X className="h-4 w-4" /> {t("delete")}
					</Button>
				)}
			</div>

			{confirming ? (
				<div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2">
					<p className="text-red-700 text-sm">{t("confirmDelete")}</p>
					<div className="flex gap-2">
						<Button
							type="button"
							variant="destructive"
							size="sm"
							disabled={deleting}
							onClick={() => {
								setConfirming(false);
								onDelete();
							}}
						>
							{deleting ? t("deleting") : t("delete")}
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setConfirming(false)}
						>
							{t("cancel")}
						</Button>
					</div>
				</div>
			) : document ? (
				<div className="flex items-center gap-3 rounded-lg bg-[#F8FAFF] px-3 py-2">
					<FileText className="h-5 w-5 shrink-0 text-[#1E40AF]" />
					<span className="truncate text-[#0F172A] text-sm">
						{document.originalFilename}
					</span>
				</div>
			) : (
				<button
					type="button"
					disabled={busy}
					onDragOver={(event) => {
						event.preventDefault();
						setDragOver(true);
					}}
					onDragLeave={() => setDragOver(false)}
					onDrop={(event) => {
						event.preventDefault();
						setDragOver(false);
						pick(event.dataTransfer.files[0]);
					}}
					onClick={() => inputRef.current?.click()}
					className={`flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-3 py-6 text-center text-sm transition-colors ${
						dragOver
							? "border-[#3B82F6] bg-[#EFF6FF]"
							: "border-[#DBEAFE] bg-[#F8FAFF] text-[#64748B]"
					} disabled:cursor-not-allowed disabled:opacity-50`}
				>
					<Upload className="h-5 w-5" aria-hidden="true" />
					{uploading ? t("uploading") : t("dropHint")}
					<input
						ref={inputRef}
						type="file"
						className="sr-only"
						accept={ACCEPTED_DOCUMENT_MIME_TYPES.join(",")}
						onChange={(event) => pick(event.target.files?.[0])}
					/>
				</button>
			)}

			{message && (
				<p role="alert" className="mt-2 text-red-600 text-xs">
					{message}
				</p>
			)}
		</div>
	);
}
