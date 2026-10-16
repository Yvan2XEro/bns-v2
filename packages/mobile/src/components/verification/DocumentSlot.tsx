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
import {
	addPages,
	type CaptureSource,
	captureHintKey,
	captureSources,
	firstRejectedPage,
	namePages,
	needsReview,
	pageAllowance,
	removePage,
	retakePage,
} from "@/src/lib/documentCapture";
import {
	isDocumentScannerAvailable,
	scanDocumentPages,
} from "@/src/lib/documentScanner";
import { useTranslation } from "@/src/lib/i18n";
import { pickVerificationDocument } from "@/src/lib/pickAndUpload";
import {
	isAcceptedDocument,
	type PickedFile,
} from "@/src/lib/verificationBusiness";
import type { VerificationDocumentKind } from "@/src/types/api";
import { CaptureReview } from "./CaptureReview";

export interface DocumentSlotProps {
	kind: VerificationDocumentKind;
	label: string;
	required: boolean;
	/** Every page already uploaded for this kind, in upload order. */
	documents: UploadedVerificationDocument[];
	/** All documents on the request, every kind: the server caps the total. */
	documentsOnRequest: number;
	uploading: boolean;
	deletingId: string | null;
	/** Set by the parent from the server's own refusal once an upload is attempted. */
	error: string | null;
	onUpload: (files: PickedFile[]) => void;
	onDelete: (documentId: string) => void;
}

interface Session {
	source: CaptureSource;
	pages: PickedFile[];
}

/**
 * One required (or extra) document. Photos — scanned, taken or picked — go
 * through a review of every page (retake, remove, add) before anything is
 * uploaded; a PDF goes straight up. Each page lands as its own document of
 * the slot's kind, so a two-sided ID or a multi-page extract stays in order.
 */
export function DocumentSlot({
	kind,
	label,
	required,
	documents,
	documentsOnRequest,
	uploading,
	deletingId,
	error,
	onUpload,
	onDelete,
}: DocumentSlotProps) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showAlert } = useAlert();
	const [localError, setLocalError] = useState<string | null>(null);
	const [session, setSession] = useState<Session | null>(null);
	const [previews, setPreviews] = useState<Record<string, string>>({});
	const [scannerAvailable] = useState(isDocumentScannerAvailable);

	const busy = uploading || deletingId !== null;
	const message = localError ?? error;
	const pages = session?.pages ?? [];
	const allowance = pageAllowance(documentsOnRequest, pages.length);
	const rejectedPage = firstRejectedPage(pages);

	/** Pages from one source; the scanner falls back to the camera when it fails. */
	const capture = async (
		source: CaptureSource,
		max: number,
	): Promise<{ source: CaptureSource; pages: PickedFile[] }> => {
		if (source === "scan") {
			const outcome = await scanDocumentPages(max);
			if (outcome.status === "success") return { source, pages: outcome.pages };
			if (outcome.status === "cancel") return { source, pages: [] };
			return capture("camera", max);
		}
		const file = await pickVerificationDocument(source);
		return { source, pages: file ? [file] : [] };
	};

	const start = async (source: CaptureSource) => {
		setLocalError(null);
		const max = pageAllowance(documentsOnRequest, 0);
		if (max < 1) {
			setLocalError(
				resolveErrorMessage({ code: "verification.documentLimit" }, t),
			);
			return;
		}
		const result = await capture(source, max);
		if (result.pages.length === 0) return;
		if (!needsReview(result.source)) {
			const check = isAcceptedDocument(result.pages[0]);
			if (!check.ok) {
				setLocalError(resolveErrorMessage({ code: check.code }, t));
				return;
			}
			onUpload(namePages(kind, result.pages));
			return;
		}
		setSession({
			source: result.source,
			pages: addPages([], result.pages, documentsOnRequest),
		});
	};

	const addPage = async () => {
		if (!session || allowance < 1) return;
		const result = await capture(session.source, allowance);
		setSession((current) =>
			current
				? {
						source: result.source,
						pages: addPages(current.pages, result.pages, documentsOnRequest),
					}
				: current,
		);
	};

	const retake = async (index: number) => {
		if (!session) return;
		const result = await capture(session.source, 1);
		setSession((current) =>
			current
				? {
						source: result.source,
						pages: retakePage(current.pages, index, result.pages[0]),
					}
				: current,
		);
	};

	const send = () => {
		if (!session || rejectedPage) return;
		const named = namePages(kind, session.pages);
		setPreviews((current) => {
			const next = { ...current };
			for (const page of named) {
				if (page.fileName) next[page.fileName] = page.uri;
			}
			return next;
		});
		setSession(null);
		onUpload(named);
	};

	const pick = () =>
		showAlert(
			t("verification.documents.chooseSource"),
			t(captureHintKey(kind)),
			[
				...captureSources(scannerAvailable).map((source) => ({
					text: t(SOURCE_LABEL[source]),
					onPress: () => void start(source),
				})),
				{ text: t("common.cancel"), style: "cancel" as const },
			],
		);

	const confirmDelete = (documentId: string) =>
		showAlert(
			t("verification.documents.confirmDeleteTitle"),
			t("verification.documents.confirmDelete"),
			[
				{
					text: t("common.delete"),
					style: "destructive",
					onPress: () => onDelete(documentId),
				},
				{ text: t("common.cancel"), style: "cancel" },
			],
			"warning",
		);

	const canAddMore = pageAllowance(documentsOnRequest, 0) > 0;

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.headerRow}>
				<Text style={[styles.label, { color: c.text }]}>
					{label}
					{required ? <Text style={{ color: c.danger }}> *</Text> : null}
				</Text>
			</View>

			{documents.map((document) => {
				const preview = previews[document.originalFilename];
				const deleting = deletingId === document.id;
				return (
					<View
						key={document.id}
						style={[styles.chip, { backgroundColor: c.neutralSoft }]}
					>
						{preview ? (
							<Image
								source={{ uri: preview }}
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
						<Text
							style={[styles.filename, { color: c.text }]}
							numberOfLines={1}
						>
							{document.originalFilename}
						</Text>
						{deleting ? (
							<ActivityIndicator color={c.danger} size="small" />
						) : !busy ? (
							<Pressable
								onPress={() => confirmDelete(document.id)}
								hitSlop={8}
								style={styles.deleteButton}
								accessibilityRole="button"
								accessibilityLabel={`${t("verification.documents.delete")} ${document.originalFilename}`}
							>
								<Ionicons name="trash-outline" size={18} color={c.danger} />
							</Pressable>
						) : null}
					</View>
				);
			})}

			{documents.length === 0 || uploading || canAddMore ? (
				<Pressable
					onPress={pick}
					disabled={busy || !canAddMore}
					style={[
						documents.length === 0 ? styles.dropzone : styles.addMore,
						{ borderColor: c.border, backgroundColor: c.input },
					]}
					accessibilityRole="button"
					accessibilityLabel={
						documents.length === 0
							? label
							: `${t("verification.capture.addPages")} ${label}`
					}
				>
					{uploading ? (
						<ActivityIndicator color={c.primary} />
					) : (
						<>
							<Ionicons
								name={
									scannerAvailable ? "scan-outline" : "cloud-upload-outline"
								}
								size={20}
								color={c.primary}
							/>
							<Text style={[styles.hint, { color: c.muted }]}>
								{documents.length === 0
									? t(
											scannerAvailable
												? "verification.capture.scanHint"
												: "verification.documents.pickHint",
										)
									: t("verification.capture.addPages")}
							</Text>
						</>
					)}
				</Pressable>
			) : null}

			{message ? (
				<Text style={[styles.error, { color: c.danger }]} role="alert">
					{message}
				</Text>
			) : null}

			<CaptureReview
				visible={session !== null}
				title={label}
				hint={t(captureHintKey(kind))}
				pages={pages}
				canAddPage={allowance > 0}
				rejected={
					rejectedPage
						? {
								index: rejectedPage.index,
								message: resolveErrorMessage({ code: rejectedPage.code }, t),
							}
						: null
				}
				onAddPage={() => void addPage()}
				onRetake={(index) => void retake(index)}
				onRemove={(index) =>
					setSession((current) =>
						current
							? { ...current, pages: removePage(current.pages, index) }
							: current,
					)
				}
				onCancel={() => setSession(null)}
				onSend={send}
			/>
		</View>
	);
}

const SOURCE_LABEL: Record<CaptureSource, string> = {
	scan: "verification.capture.sourceScan",
	camera: "verification.documents.sourceCamera",
	library: "verification.documents.sourceLibrary",
	document: "verification.documents.sourceDocument",
};

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
		minHeight: 44,
		minWidth: 44,
		alignItems: "center",
		justifyContent: "center",
	},
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
	addMore: {
		flexDirection: "row",
		borderWidth: 1,
		borderStyle: "dashed",
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		minHeight: 48,
	},
	hint: { fontSize: 13, fontFamily: Fonts.body },
	error: { fontSize: 12, fontFamily: Fonts.body },
});
