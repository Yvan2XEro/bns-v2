import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { dangerInk, fillOf } from "@/src/components/shop/ink";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	useDeleteVerificationDocument,
	useSubmitIdentity,
	useUploadVerificationDocument,
} from "@/src/hooks/useVerification";
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { IDENTITY_KINDS, missingIdentityKinds } from "@/src/lib/verification";
import type { PickedFile } from "@/src/lib/verificationBusiness";
import type {
	ShopVerificationResponse,
	VerificationDocumentKind,
} from "@/src/types/api";
import { ConsentNotice } from "./ConsentNotice";
import { DocumentSlot } from "./DocumentSlot";

/**
 * Level 2 checked by hand (`identityMethod: "manual"`): both sides of the ID
 * and a selfie holding it, then a submit that carries the consent. A
 * moderator compares them; nothing is sent to an outside vendor.
 * `requestId` is the draft `useIdentityConsentForm` opened or resumed.
 */
export function ManualIdentity({
	shopId,
	requestId,
	view,
}: {
	shopId: string;
	requestId: string | undefined;
	view: ShopVerificationResponse;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const upload = useUploadVerificationDocument(shopId, requestId);
	const remove = useDeleteVerificationDocument(shopId, requestId);
	const submit = useSubmitIdentity(shopId, requestId);

	const [accepted, setAccepted] = useState(false);
	const [uploadingKind, setUploadingKind] =
		useState<VerificationDocumentKind | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [slotError, setSlotError] = useState<{
		kind: VerificationDocumentKind;
		message: string;
	} | null>(null);
	const [formError, setFormError] = useState<string | null>(null);

	const level2 = view.requests.level2;
	const request =
		level2 &&
		level2.id === requestId &&
		(level2.status === "draft" || level2.status === "needs_info")
			? level2
			: null;
	const documents = request?.documents ?? [];
	const isResubmit = request?.status === "needs_info";
	const missing = missingIdentityKinds(documents);
	const consentOk = isResubmit || (accepted && Boolean(view.consentVersion));
	const ready =
		Boolean(request) && missing.length === 0 && consentOk && view.enabled;
	const busy = submit.isPending || uploadingKind !== null;

	const handleUpload = async (
		kind: VerificationDocumentKind,
		files: PickedFile[],
	) => {
		if (!requestId) return;
		setUploadingKind(kind);
		setSlotError(null);
		try {
			for (const file of files) {
				await upload.mutateAsync({ kind, file });
			}
		} catch (error) {
			setSlotError({ kind, message: resolveErrorMessage(error, t) });
		} finally {
			setUploadingKind(null);
		}
	};

	const handleDelete = (kind: VerificationDocumentKind, documentId: string) => {
		setDeletingId(documentId);
		setSlotError(null);
		remove.mutate(documentId, {
			onSettled: () => setDeletingId(null),
			onError: (error) =>
				setSlotError({ kind, message: resolveErrorMessage(error, t) }),
		});
	};

	const handleSubmit = async () => {
		if (!ready) return;
		setFormError(null);
		try {
			await submit.mutateAsync(
				isResubmit || !view.consentVersion
					? null
					: {
							consentVersion: view.consentVersion,
							locale: i18n.language?.startsWith("en") ? "en" : "fr",
						},
			);
			router.replace("/seller/verification" as never);
		} catch (error) {
			if (
				error instanceof ApiError &&
				error.code === ERROR_CODES.verificationConsentRequired
			) {
				// The notice was replaced while this screen was open.
				setAccepted(false);
			}
			setFormError(resolveErrorMessage(error, t));
		}
	};

	return (
		<ScrollView
			contentContainerStyle={styles.content}
			keyboardShouldPersistTaps="handled"
		>
			{!view.enabled ? (
				<View style={[styles.banner, { backgroundColor: c.warningSoft }]}>
					<Text style={[styles.bannerText, { color: c.warningText }]}>
						{t("apiErrors.verification.disabled")}
					</Text>
				</View>
			) : null}

			<View style={styles.header}>
				<Text style={[styles.title, { color: c.text }]}>
					{t("verification.identity.manual.title")}
				</Text>
				<Text style={[styles.body, { color: c.body }]}>
					{t("verification.identity.manual.intro")}
				</Text>
			</View>

			{IDENTITY_KINDS.map((kind) => (
				<View key={kind} style={styles.slot}>
					<DocumentSlot
						kind={kind}
						label={t(`verification.documentKind.${kind}`)}
						required
						documents={documents.filter((d) => d.kind === kind)}
						documentsOnRequest={documents.length}
						uploading={uploadingKind === kind}
						deletingId={deletingId}
						error={slotError?.kind === kind ? slotError.message : null}
						onUpload={(files) => void handleUpload(kind, files)}
						onDelete={(documentId) => handleDelete(kind, documentId)}
					/>
					<Text style={[styles.hint, { color: c.muted }]}>
						{t(`verification.identity.manual.hint.${kind}`)}
					</Text>
				</View>
			))}

			{!isResubmit ? (
				<ConsentNotice
					method="manual"
					checked={accepted}
					onToggle={setAccepted}
				/>
			) : null}

			{missing.length > 0 ? (
				<Text style={[styles.hint, { color: c.muted }]}>
					{t("verification.documents.missing", {
						kinds: missing
							.map((kind) => t(`verification.documentKind.${kind}`))
							.join(", "),
					})}
				</Text>
			) : null}

			{formError ? (
				<Text role="alert" style={[styles.hint, { color: dangerInk(c) }]}>
					{formError}
				</Text>
			) : null}

			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("verification.identity.manual.submit")}
				accessibilityState={{ disabled: !ready || busy }}
				disabled={!ready || busy}
				onPress={() => void handleSubmit()}
				style={[
					styles.submit,
					{ backgroundColor: fillOf(c), opacity: !ready || busy ? 0.5 : 1 },
				]}
			>
				{submit.isPending ? (
					<ActivityIndicator color="#ffffff" />
				) : (
					<Text style={styles.submitLabel}>
						{t("verification.identity.manual.submit")}
					</Text>
				)}
			</Pressable>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	content: { padding: 16, gap: 16, paddingBottom: 40 },
	banner: { borderRadius: 12, padding: 12 },
	bannerText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	header: { gap: 6 },
	title: { fontSize: 17, lineHeight: 24, fontFamily: Fonts.bodyBold },
	body: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	slot: { gap: 6 },
	hint: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	submit: {
		minHeight: 48,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	submitLabel: {
		color: "#ffffff",
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
	},
});
