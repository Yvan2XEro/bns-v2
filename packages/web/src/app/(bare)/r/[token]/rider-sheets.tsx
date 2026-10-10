"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { resolveErrorMessage } from "~/lib/apiError";
import type { ProofKind, StoredPhoto } from "~/lib/rider-page";
import {
	ATTEMPT_REASONS,
	type AttemptValues,
	attemptSchema,
	type HandoverCodeValues,
	handoverCodeSchema,
} from "~/lib/shipment-panel";
import { FAILURE_REASON_LABELS } from "~/lib/shipment-status";

interface SheetProps {
	open: boolean;
	onClose: () => void;
}

interface PhotoSlot {
	kind: ProofKind;
	stored: StoredPhoto | null;
	uploading: boolean;
	onPick: (file: File, kind: ProofKind) => void;
}

const BUTTON =
	"min-h-14 w-full rounded-2xl bg-[#1E40AF] px-4 font-bold text-lg text-white disabled:opacity-60";

function PhotoInput({
	id,
	kind,
	uploading,
	onPick,
	label,
}: {
	id: string;
	kind: ProofKind;
	uploading: boolean;
	onPick: (file: File, kind: ProofKind) => void;
	label: string;
}) {
	return (
		<label
			htmlFor={id}
			className="flex min-h-14 w-full cursor-pointer items-center justify-center rounded-2xl border border-[#CBD5E1] font-semibold"
		>
			{label}
			<input
				id={id}
				type="file"
				accept="image/*"
				capture="environment"
				className="sr-only"
				disabled={uploading}
				onChange={(event) => {
					const file = event.target.files?.[0];
					if (file) onPick(file, kind);
					event.target.value = "";
				}}
			/>
		</label>
	);
}

export function FailureSheet({
	open,
	onClose,
	pending,
	error,
	onSubmit,
	photo,
}: SheetProps & {
	pending: boolean;
	error: unknown;
	onSubmit: (values: AttemptValues) => void;
	photo: PhotoSlot;
}) {
	const t = useTranslations("Rider");
	const tRoot = useTranslations();
	const { register, handleSubmit, formState } = useForm<AttemptValues>({
		resolver: zodResolver(attemptSchema),
		defaultValues: { reason: "absent", note: "" },
	});
	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{t("failureTitle")}</DialogTitle>
					<DialogDescription>{t("failureBody")}</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={handleSubmit(onSubmit)}
					className="space-y-3"
					noValidate
				>
					<fieldset className="space-y-1">
						<legend className="sr-only">{t("failureTitle")}</legend>
						{ATTEMPT_REASONS.map((reason) => (
							<label
								key={reason}
								className="flex min-h-12 items-center gap-3 text-base"
							>
								<input
									type="radio"
									value={reason}
									className="h-6 w-6 accent-[#1E40AF]"
									{...register("reason")}
								/>
								{tRoot(`Delivery.${FAILURE_REASON_LABELS[reason]}`)}
							</label>
						))}
					</fieldset>
					<div className="space-y-1">
						<label htmlFor="rider-note" className="block font-medium text-sm">
							{t("note")}
						</label>
						<textarea
							id="rider-note"
							rows={2}
							className="w-full rounded-xl border border-[#CBD5E1] p-3 text-base"
							{...register("note")}
						/>
						{formState.errors.note && (
							<p className="text-red-600 text-xs">{t("noteTooLong")}</p>
						)}
					</div>
					<PhotoInput
						id="rider-failure-photo"
						label={t("addPhoto")}
						kind={photo.kind}
						uploading={photo.uploading}
						onPick={photo.onPick}
					/>
					{photo.stored?.kind === "attempt" && (
						<p className="text-[#166534] text-sm">{t("photoAdded")}</p>
					)}
					{error ? (
						<p role="alert" className="text-red-700 text-sm">
							{resolveErrorMessage(error, tRoot)}
						</p>
					) : null}
					<button type="submit" disabled={pending} className={BUTTON}>
						{t("failureSubmit")}
					</button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function CodeSheet({
	open,
	onClose,
	pending,
	error,
	onSubmit,
	photo,
}: SheetProps & {
	pending: boolean;
	error: unknown;
	onSubmit: (code: string) => void;
	photo: PhotoSlot;
}) {
	const t = useTranslations("Rider");
	const tRoot = useTranslations();
	const { register, handleSubmit, formState } = useForm<HandoverCodeValues>({
		resolver: zodResolver(handoverCodeSchema),
		defaultValues: { code: "" },
	});
	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("codeTitle")}</DialogTitle>
					<DialogDescription>{t("codeBody")}</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={handleSubmit(({ code }) => onSubmit(code))}
					className="space-y-3"
					noValidate
				>
					<input
						inputMode="numeric"
						autoComplete="one-time-code"
						maxLength={4}
						aria-label={t("codeLabel")}
						className="w-full rounded-2xl border border-[#CBD5E1] p-4 text-center font-bold font-mono text-4xl tracking-[0.5em]"
						{...register("code")}
					/>
					{formState.errors.code && (
						<p role="alert" className="text-red-700 text-sm">
							{t("codeFormat")}
						</p>
					)}
					<PhotoInput
						id="rider-code-photo"
						label={t("addPhoto")}
						kind={photo.kind}
						uploading={photo.uploading}
						onPick={photo.onPick}
					/>
					{photo.stored?.kind === "handover" && (
						<p className="text-[#166534] text-sm">{t("photoAdded")}</p>
					)}
					{error ? (
						<p role="alert" className="text-red-700 text-sm">
							{resolveErrorMessage(error, tRoot)}
						</p>
					) : null}
					<button type="submit" disabled={pending} className={BUTTON}>
						{t("codeSubmit")}
					</button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function PhotoSheet({
	open,
	onClose,
	uploading,
	error,
	onPick,
}: SheetProps & {
	uploading: boolean;
	error: unknown;
	onPick: (file: File, kind: ProofKind) => void;
}) {
	const t = useTranslations("Rider");
	const tRoot = useTranslations();
	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("photoTitle")}</DialogTitle>
					<DialogDescription>{t("photoBody")}</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<PhotoInput
						id="rider-photo-handover"
						kind="handover"
						uploading={uploading}
						onPick={(file, kind) => {
							onPick(file, kind);
							onClose();
						}}
						label={t("photoForHandover")}
					/>
					<PhotoInput
						id="rider-photo-attempt"
						kind="attempt"
						uploading={uploading}
						onPick={(file, kind) => {
							onPick(file, kind);
							onClose();
						}}
						label={t("photoForFailure")}
					/>
					{error ? (
						<p role="alert" className="text-red-700 text-sm">
							{resolveErrorMessage(error, tRoot)}
						</p>
					) : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}
