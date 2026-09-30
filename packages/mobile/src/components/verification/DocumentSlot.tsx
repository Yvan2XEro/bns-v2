import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import type { UploadedVerificationDocument } from "@/src/hooks/useVerification";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	pickVerificationDocument,
	type VerificationDocumentSource,
} from "@/src/lib/pickAndUpload";
import {
	isAcceptedDocument,
	type PickedFile,
} from "@/src/lib/verificationBusiness";

export interface DocumentSlotProps {
	label: string;
	required: boolean;
	document: UploadedVerificationDocument | null;
	uploading: boolean;
	deleting: boolean;
	/** Set by the parent from the server's own refusal once an upload is attempted. */
	error: string | null;
	onUpload: (file: PickedFile) => void;
	onDelete: () => void;
}

/**
 * One required (or extra) document: a three-source picker, a picked-file
 * chip, or a confirm-before-delete alert — never an inline confirmation for
 * a decision this small.
 */
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
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showAlert } = useAlert();
	const [localError, setLocalError] = useState<string | null>(null);
	const [localUri, setLocalUri] = useState<string | null>(null);

	const busy = uploading || deleting;
	const message = localError ?? error;

	const pickFrom = async (source: VerificationDocumentSource) => {
		const file = await pickVerificationDocument(source);
		if (!file) return;
		const check = isAcceptedDocument({
			mimeType: file.mimeType,
			size: file.size,
		});
		if (!check.ok) {
			setLocalError(resolveErrorMessage({ code: check.code }, t));
			return;
		}
		setLocalError(null);
		setLocalUri(file.mimeType?.startsWith("image/") ? file.uri : null);
		onUpload(file);
	};

	const pick = () =>
		showAlert(t("verification.documents.chooseSource"), undefined, [
			{
				text: t("verification.documents.sourceCamera"),
				onPress: () => pickFrom("camera"),
			},
			{
				text: t("verification.documents.sourceLibrary"),
				onPress: () => pickFrom("library"),
			},
			{
				text: t("verification.documents.sourceDocument"),
				onPress: () => pickFrom("document"),
			},
			{ text: t("common.cancel"), style: "cancel" },
		]);

	const confirmDelete = () =>
		showAlert(
			t("verification.documents.confirmDeleteTitle"),
			t("verification.documents.confirmDelete"),
			[
				{ text: t("common.delete"), style: "destructive", onPress: onDelete },
				{ text: t("common.cancel"), style: "cancel" },
			],
			"warning",
		);

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.headerRow}>
				<Text style={[styles.label, { color: c.text }]}>
					{label}
					{required ? <Text style={{ color: c.danger }}> *</Text> : null}
				</Text>
				{document && !busy ? (
					<Pressable
						onPress={confirmDelete}
						hitSlop={8}
						style={styles.deleteButton}
						accessibilityRole="button"
						accessibilityLabel={t("verification.documents.delete")}
					>
						<Ionicons name="trash-outline" size={16} color={c.danger} />
						<Text style={[styles.deleteText, { color: c.danger }]}>
							{t("verification.documents.delete")}
						</Text>
					</Pressable>
				) : null}
			</View>

			{document ? (
				<View style={[styles.chip, { backgroundColor: c.neutralSoft }]}>
					{localUri ? (
						<Image
							source={{ uri: localUri }}
							style={styles.thumb}
							contentFit="cover"
						/>
					) : (
						<Ionicons
							name={
								document.mimeType === "application/pdf"
									? "document-text-outline"
									: "image-outline"
							}
							size={22}
							color={c.muted}
						/>
					)}
					<Text style={[styles.filename, { color: c.text }]} numberOfLines={1}>
						{document.originalFilename}
					</Text>
					{deleting ? (
						<ActivityIndicator color={c.danger} size="small" />
					) : null}
				</View>
			) : (
				<Pressable
					onPress={pick}
					disabled={busy}
					style={[
						styles.dropzone,
						{ borderColor: c.border, backgroundColor: c.input },
					]}
					accessibilityRole="button"
					accessibilityLabel={label}
				>
					{uploading ? (
						<ActivityIndicator color={c.primary} />
					) : (
						<>
							<Ionicons
								name="cloud-upload-outline"
								size={20}
								color={c.primary}
							/>
							<Text style={[styles.hint, { color: c.muted }]}>
								{t("verification.documents.pickHint")}
							</Text>
						</>
					)}
				</Pressable>
			)}

			{message ? (
				<Text style={[styles.error, { color: c.danger }]} role="alert">
					{message}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 8,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	label: { fontSize: 14, fontFamily: Fonts.bodySemibold, flex: 1 },
	deleteButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		minHeight: 44,
		paddingHorizontal: 6,
		justifyContent: "center",
	},
	deleteText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderRadius: 10,
		padding: 10,
		minHeight: 44,
	},
	thumb: { width: 36, height: 36, borderRadius: 8 },
	filename: { flex: 1, fontSize: 13, fontFamily: Fonts.body },
	dropzone: {
		borderWidth: 1,
		borderStyle: "dashed",
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		minHeight: 72,
	},
	hint: { fontSize: 13, fontFamily: Fonts.body },
	error: { fontSize: 12, fontFamily: Fonts.body },
});
