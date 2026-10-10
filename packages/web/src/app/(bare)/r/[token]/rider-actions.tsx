"use client";

import { Camera, Check, Hash, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	useRiderAttempt,
	useRiderHandover,
	useRiderPhoto,
	useRiderPickedUp,
} from "~/hooks/use-rider-link";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	attemptBody,
	capturePosition,
	handoverBody,
	type ProofKind,
	photoFor,
	pickedUpBody,
	type RiderAction,
	riderButtons,
	type StoredPhoto,
} from "~/lib/rider-page";
import { CodeSheet, FailureSheet, PhotoSheet } from "./rider-sheets";

const ICONS = { picked_up: Check, attempt: X, handover: Hash, photo: Camera };
const TONES = {
	primary: "bg-[#1E40AF] text-white",
	danger: "bg-[#B91C1C] text-white",
	neutral: "border border-[#CBD5E1] bg-white text-[#0F172A]",
};

const here = () =>
	capturePosition(
		typeof navigator === "undefined" ? undefined : navigator.geolocation,
	);

/**
 * Every call to the API starts from a press: there is no effect in this file,
 * so a link preview that merely opens the page can never move a parcel.
 */
export function RiderActions({
	token,
	allowed,
	onDelivered,
}: {
	token: string;
	allowed: readonly RiderAction[];
	onDelivered: () => void;
}) {
	const t = useTranslations("Rider");
	const tRoot = useTranslations();
	const [sheet, setSheet] = useState<RiderAction | null>(null);
	const [photo, setPhoto] = useState<StoredPhoto | null>(null);
	const pickedUp = useRiderPickedUp(token);
	const attempt = useRiderAttempt(token);
	const handover = useRiderHandover(token);
	const upload = useRiderPhoto(token);
	const busy = pickedUp.isPending || attempt.isPending || handover.isPending;
	const buttons = riderButtons(allowed);
	const failure = [pickedUp, attempt].find((m) => m.isError);

	const onPress = async (action: RiderAction) => {
		if (action !== "picked_up") {
			setSheet(action);
			return;
		}
		pickedUp.mutate(pickedUpBody(await here()));
	};

	const onSubmitAttempt = async (values: { reason: string; note: string }) => {
		const gps = await here();
		attempt.mutate(
			attemptBody({ ...values, gps, photoId: photoFor("attempt", photo) }),
			{
				onSuccess: () => {
					setSheet(null);
					setPhoto(null);
				},
			},
		);
	};

	const onSubmitCode = async (code: string) => {
		const gps = await here();
		handover.mutate(
			handoverBody({ code, gps, photoId: photoFor("handover", photo) }),
			{ onSuccess: onDelivered },
		);
	};

	const onPickPhoto = (file: File, kind: ProofKind) => {
		upload.mutate(
			{ file, kind },
			{ onSuccess: (stored) => setPhoto({ id: stored.id, kind }) },
		);
	};

	return (
		<div className="space-y-3">
			{buttons.length === 0 && (
				<p className="py-4 text-center text-[#64748B] text-sm">
					{t("nothingToDo")}
				</p>
			)}
			{buttons.map((button) => {
				const Icon = ICONS[button.action];
				return (
					<button
						key={button.action}
						type="button"
						disabled={busy}
						onClick={() => void onPress(button.action)}
						className={`flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl px-4 font-bold text-lg disabled:opacity-60 ${TONES[button.tone]}`}
					>
						<Icon aria-hidden className="h-6 w-6" /> {t(button.labelKey)}
					</button>
				);
			})}
			{photo && (
				<p className="text-center text-[#166534] text-sm">{t("photoAdded")}</p>
			)}
			{failure && (
				<p role="alert" className="text-center text-red-700 text-sm">
					{resolveErrorMessage(failure.error, tRoot)}
				</p>
			)}
			<FailureSheet
				open={sheet === "attempt"}
				onClose={() => setSheet(null)}
				pending={attempt.isPending}
				error={attempt.error}
				onSubmit={onSubmitAttempt}
				photo={{
					kind: "attempt",
					stored: photo,
					uploading: upload.isPending,
					onPick: onPickPhoto,
				}}
			/>
			<CodeSheet
				open={sheet === "handover"}
				onClose={() => setSheet(null)}
				pending={handover.isPending}
				error={handover.error}
				onSubmit={onSubmitCode}
				photo={{
					kind: "handover",
					stored: photo,
					uploading: upload.isPending,
					onPick: onPickPhoto,
				}}
			/>
			<PhotoSheet
				open={sheet === "photo"}
				onClose={() => setSheet(null)}
				uploading={upload.isPending}
				error={upload.error}
				onPick={onPickPhoto}
			/>
		</div>
	);
}
