"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { noteReady } from "~/lib/moderation-dispute-notes";

export function ConfirmNotePanel({
	noteLabel,
	confirmLabel,
	note,
	onNote,
	onConfirm,
	onCancel,
	pending,
}: {
	noteLabel: string;
	confirmLabel: string;
	note: string;
	onNote: (value: string) => void;
	onConfirm: () => void;
	onCancel: () => void;
	pending: boolean;
}) {
	const t = useTranslations("ModerationDisputes");
	return (
		<div className="mt-2 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
			<textarea
				aria-label={noteLabel}
				rows={2}
				maxLength={2000}
				value={note}
				onChange={(e) => onNote(e.target.value)}
				className="w-full rounded-lg border border-[#CBD5E1] bg-white p-2 text-sm"
			/>
			<p className="text-[#64748B] text-xs">{t("noteHint")}</p>
			<div className="flex gap-2">
				<Button
					type="button"
					variant="destructive"
					disabled={!noteReady(note) || pending}
					onClick={onConfirm}
				>
					{confirmLabel}
				</Button>
				<Button type="button" variant="outline" onClick={onCancel}>
					{t("cancel")}
				</Button>
			</div>
		</div>
	);
}

/** Nothing is sent until the moderator opens the panel, writes a note and confirms. */
export function ConfirmNoteAction({
	label,
	noteLabel,
	confirmLabel,
	pending,
	onConfirm,
}: {
	label: string;
	noteLabel: string;
	confirmLabel: string;
	pending: boolean;
	onConfirm: (note: string, done: () => void) => void;
}) {
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const close = () => {
		setOpen(false);
		setNote("");
	};
	if (!open) {
		return (
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => setOpen(true)}
			>
				{label}
			</Button>
		);
	}
	return (
		<ConfirmNotePanel
			noteLabel={noteLabel}
			confirmLabel={confirmLabel}
			note={note}
			onNote={setNote}
			pending={pending}
			onCancel={close}
			onConfirm={() => onConfirm(note, close)}
		/>
	);
}
