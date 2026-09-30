import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import type { UploadedVerificationDocument } from "@/src/hooks/useVerification";
import { useTranslation } from "@/src/lib/i18n";
import type { PickedFile } from "@/src/lib/verificationBusiness";
import type { VerificationDocumentKind } from "@/src/types/api";
import { DocumentSlot } from "./DocumentSlot";

/** The one extra slot every request may fill in beyond its required kinds. */
const EXTRA_KIND: VerificationDocumentKind = "other";

export interface DocumentSlotsProps {
	kinds: VerificationDocumentKind[];
	documents: UploadedVerificationDocument[];
	uploadingKind: VerificationDocumentKind | null;
	deletingId: string | null;
	uploadError: { kind: VerificationDocumentKind; message: string } | null;
	onUpload: (kind: VerificationDocumentKind, file: PickedFile) => void;
	onDelete: (kind: VerificationDocumentKind, documentId: string) => void;
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
	const c = useShopTheme();
	const { t } = useTranslation();
	const documentFor = (kind: VerificationDocumentKind) =>
		documents.find((document) => document.kind === kind) ?? null;

	const renderSlot = (kind: VerificationDocumentKind, required: boolean) => {
		const document = documentFor(kind);
		return (
			<DocumentSlot
				key={kind}
				label={t(`verification.documentKind.${kind}`)}
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
		<View style={{ gap: 20 }}>
			<View style={{ gap: 10 }}>
				<Text style={[styles.title, { color: c.text }]}>
					{t("verification.documents.title")}
				</Text>
				<View style={{ gap: 10 }}>
					{kinds.map((kind) => renderSlot(kind, true))}
				</View>
			</View>
			<View style={{ gap: 10 }}>
				<Text style={[styles.title, { color: c.text }]}>
					{t("verification.documents.extrasTitle")}
				</Text>
				{renderSlot(EXTRA_KIND, false)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	title: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
