import { useState } from "react";
import { Share, Text, View } from "react-native";
import {
	NoteField,
	ReasonPicker,
	SheetButton,
} from "@/src/components/sellerOrders/FormBits";
import { HandoverKeypad } from "@/src/components/sellerOrders/HandoverKeypad";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	useAssignShopRider,
	useCreateRiderLink,
	useHandoverShipment,
	useReportAttempt,
} from "@/src/hooks/useShipmentActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { tryCurrentGps } from "@/src/lib/currentPosition";
import {
	HANDOVER_CODE_LENGTH,
	type KeypadKey,
	pressKey,
} from "@/src/lib/handoverKeypad";
import { useTranslation } from "@/src/lib/i18n";
import {
	FAILURE_REASON_LABELS,
	type FailureReason,
} from "@/src/lib/shipmentStatus";
import { TextField } from "./FormFields";

const REASONS = Object.keys(FAILURE_REASON_LABELS) as FailureReason[];

function ErrorLine({ error }: { error: unknown }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	if (!error) return null;
	return (
		<Text accessibilityRole="alert" style={{ color: c.danger }}>
			{resolveErrorMessage(error, t, t("shipmentPanel.actionFailed"))}
		</Text>
	);
}

/** The reason list, a note, and a fix taken when the report is sent. */
export function AttemptPanel({
	shipmentId,
	onDone,
}: {
	shipmentId: string;
	onDone: () => void;
}) {
	const { t } = useTranslation();
	const attempt = useReportAttempt(shipmentId);
	const [reason, setReason] = useState<FailureReason | null>(null);
	const [note, setNote] = useState("");
	const send = async () => {
		if (!reason) return;
		const gps = await tryCurrentGps();
		attempt.mutate(
			{
				reason,
				...(note.trim() ? { note: note.trim() } : {}),
				...(gps ? { gps } : {}),
			},
			{ onSuccess: onDone },
		);
	};
	return (
		<View style={{ gap: 12 }}>
			<ReasonPicker
				options={REASONS}
				labelKeys={FAILURE_REASON_LABELS}
				value={reason}
				onChange={setReason}
			/>
			<NoteField
				label={t("shipmentPanel.note")}
				value={note}
				onChange={setNote}
				onBlur={() => undefined}
			/>
			<ErrorLine error={attempt.error} />
			<SheetButton
				label={t("shipmentPanel.reportAttempt")}
				pending={attempt.isPending}
				disabled={!reason}
				onPress={() => void send()}
			/>
		</View>
	);
}

/** The P4 keypad, extended: the fix is taken when the code is sent. */
export function HandoverPanel({
	shipmentId,
	onDone,
}: {
	shipmentId: string;
	onDone: () => void;
}) {
	const { t } = useTranslation();
	const handover = useHandoverShipment(shipmentId);
	const [code, setCode] = useState("");
	const send = async () => {
		const gps = await tryCurrentGps();
		handover.mutate(
			{ code, ...(gps ? { gps } : {}) },
			{
				onSuccess: onDone,
				onError: () => setCode(""),
			},
		);
	};
	return (
		<View style={{ gap: 12 }}>
			<HandoverKeypad
				code={code}
				error={Boolean(handover.error)}
				disabled={handover.isPending}
				onKey={(key: KeypadKey) => {
					if (handover.error) handover.reset();
					setCode(pressKey(code, key));
				}}
			/>
			<ErrorLine error={handover.error} />
			<SheetButton
				label={t("sellerOrders.handoverSubmit")}
				pending={handover.isPending}
				disabled={code.length < HANDOVER_CODE_LENGTH}
				onPress={() => void send()}
			/>
		</View>
	);
}

/** An external rider: name and phone, then the link, shown once, goes to the share sheet. */
export function RiderPanel({
	shipmentId,
	known,
	onDone,
}: {
	shipmentId: string;
	known: { name: string; phone: string } | null;
	onDone: () => void;
}) {
	const { t } = useTranslation();
	const assign = useAssignShopRider(shipmentId);
	const link = useCreateRiderLink(shipmentId);
	const [name, setName] = useState(known?.name ?? "");
	const [phone, setPhone] = useState(known?.phone ?? "");
	const [url, setUrl] = useState<string | null>(null);
	const valid = name.trim() !== "" && phone.trim().length >= 7;

	const share = (link: string) =>
		Share.share({
			message: t("shipmentPanel.riderLinkMessage", { url: link }),
		});

	const submit = () =>
		assign.mutate(
			{ name: name.trim(), phone: phone.trim() },
			{
				onSuccess: () =>
					link.mutate(undefined, {
						onSuccess: ({ url: created }) => {
							setUrl(created);
							void share(created);
						},
					}),
			},
		);

	return (
		<View style={{ gap: 12 }}>
			<TextField
				label={t("shipmentPanel.riderName")}
				value={name}
				onChange={setName}
			/>
			<TextField
				label={t("shipmentPanel.riderPhone")}
				value={phone}
				onChange={setPhone}
				keyboardType="phone-pad"
			/>
			<ErrorLine error={assign.error ?? link.error} />
			{url ? (
				<>
					<Text selectable>{url}</Text>
					<Text>{t("shipmentPanel.riderLinkOnce")}</Text>
					<SheetButton
						label={t("shipmentPanel.shareAgain")}
						tone="secondary"
						onPress={() => void share(url)}
					/>
					<SheetButton label={t("common.done")} onPress={onDone} />
				</>
			) : (
				<SheetButton
					label={t("shipmentPanel.assignAndShare")}
					pending={assign.isPending || link.isPending}
					disabled={!valid}
					onPress={submit}
				/>
			)}
		</View>
	);
}
