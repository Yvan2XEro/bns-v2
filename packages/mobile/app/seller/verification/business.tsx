import { router } from "expo-router";
import { useReducer } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { BusinessForm } from "@/src/components/verification/BusinessForm";
import { DocumentSlots } from "@/src/components/verification/DocumentSlots";
import { useMyShop } from "@/src/hooks/useShops";
import {
	useDeleteVerificationDocument,
	useShopVerification,
	useSubmitVerification,
	useUploadVerificationDocument,
} from "@/src/hooks/useVerification";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { PickedFile } from "@/src/lib/verificationBusiness";
import {
	canSubmit,
	missingKinds,
	requiredKinds,
	toBusinessValues,
} from "@/src/lib/verificationBusiness";
import type { VerificationDocumentKind } from "@/src/types/api";

type Step = "form" | "documents";

interface State {
	step: Step;
	uploadingKind: VerificationDocumentKind | null;
	deletingId: string | null;
	actionError: { kind: VerificationDocumentKind; message: string } | null;
}

const initialState: State = {
	step: "form",
	uploadingKind: null,
	deletingId: null,
	actionError: null,
};

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

/** `/seller/verification/business` — the level-3 request's business details
 * and required documents. Reached from the verification hub, which already
 * opens the request; this screen only ever edits an existing one. */
export default function BusinessVerificationScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const myShop = useMyShop();
	const shop = myShop.data?.shop;
	const query = useShopVerification(shop?.id);
	const request = query.data?.requests.level3 ?? null;
	const upload = useUploadVerificationDocument(shop?.id, request?.id);
	const remove = useDeleteVerificationDocument(shop?.id, request?.id);
	const submit = useSubmitVerification(shop?.id, request?.id);
	const [state, patch] = useReducer(reducer, initialState);

	const isLoading = myShop.isPending || (Boolean(shop?.id) && query.isPending);
	const isError = myShop.isError || (Boolean(shop?.id) && query.isError);
	const business = request?.business ?? null;
	const businessValues = business ? toBusinessValues(business) : null;
	const documents = request?.documents ?? [];
	const kinds = businessValues
		? requiredKinds(
				businessValues.businessType,
				businessValues.legalRepresentativeIsOwner,
			)
		: [];
	const missing = businessValues ? missingKinds(businessValues, documents) : [];
	const ready = businessValues ? canSubmit(businessValues, documents) : false;

	const handleUpload = (kind: VerificationDocumentKind, file: PickedFile) => {
		patch({ uploadingKind: kind, actionError: null });
		upload.mutate(
			{ kind, file },
			{
				onSettled: () => patch({ uploadingKind: null }),
				onError: (error) =>
					patch({
						actionError: { kind, message: resolveErrorMessage(error, t) },
					}),
			},
		);
	};

	const handleDelete = (kind: VerificationDocumentKind, documentId: string) => {
		patch({ deletingId: documentId, actionError: null });
		remove.mutate(documentId, {
			onSettled: () => patch({ deletingId: null }),
			onError: (error) =>
				patch({
					actionError: { kind, message: resolveErrorMessage(error, t) },
				}),
		});
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("verification.business.pageTitle")} />

			{isLoading ? (
				<View style={styles.center}>
					<ActivityIndicator color={c.primary} />
				</View>
			) : null}

			{!isLoading && isError ? (
				<EmptyState
					illustration="notFound"
					title={t("common.error")}
					subtitle={resolveErrorMessage(myShop.error ?? query.error, t)}
					ctaLabel={t("common.retry")}
					onCta={() => {
						void myShop.refetch();
						void query.refetch();
					}}
				/>
			) : null}

			{!isLoading && !isError && myShop.data && !shop ? (
				<EmptyState
					illustration="sell"
					title={t("seller.noShopTitle")}
					ctaLabel={t("account.openShop")}
					onCta={() => router.replace("/shop/create" as never)}
				/>
			) : null}

			{!isLoading && !isError && shop && (!request || !business) ? (
				<EmptyState
					illustration="notFound"
					title={t("verification.business.noRequest")}
					ctaLabel={t("verification.business.backToHub")}
					onCta={() =>
						router.canGoBack()
							? router.back()
							: router.replace("/seller/verification" as never)
					}
				/>
			) : null}

			{!isLoading &&
			!isError &&
			shop &&
			request &&
			business &&
			businessValues ? (
				<>
					<View style={[styles.tabs, { borderBottomColor: c.border }]}>
						{(["form", "documents"] as const).map((step) => {
							const active = state.step === step;
							const label = t(
								step === "form"
									? "verification.business.title"
									: "verification.documents.title",
							);
							return (
								<Pressable
									key={step}
									onPress={() => patch({ step })}
									style={[
										styles.tab,
										active && { borderBottomColor: c.primary },
									]}
									accessibilityRole="tab"
									accessibilityState={{ selected: active }}
									accessibilityLabel={label}
								>
									<Text
										style={[
											styles.tabText,
											{ color: active ? c.primary : c.muted },
										]}
									>
										{label}
									</Text>
								</Pressable>
							);
						})}
					</View>

					{state.step === "form" ? (
						<BusinessForm
							shopId={shop.id}
							requestId={request.id}
							defaultValues={businessValues}
							onSaved={() => patch({ step: "documents" })}
						/>
					) : (
						<ScrollView contentContainerStyle={styles.scroll}>
							<DocumentSlots
								kinds={kinds}
								documents={documents}
								uploadingKind={state.uploadingKind}
								deletingId={state.deletingId}
								uploadError={state.actionError}
								onUpload={handleUpload}
								onDelete={handleDelete}
							/>

							<View style={styles.footer}>
								{!ready && missing.length > 0 ? (
									<Text style={[styles.missing, { color: c.muted }]}>
										{t("verification.documents.missing", {
											kinds: missing
												.map((kind) => t(`verification.documentKind.${kind}`))
												.join(", "),
										})}
									</Text>
								) : null}
								{submit.isError ? (
									<Text
										role="alert"
										style={[styles.submitError, { color: c.danger }]}
									>
										{resolveErrorMessage(submit.error, t)}
									</Text>
								) : null}
								<Pressable
									onPress={() => submit.mutate()}
									disabled={!ready || submit.isPending}
									accessibilityRole="button"
									accessibilityLabel={t("verification.documents.submit")}
									style={[
										styles.submit,
										{
											backgroundColor: c.primary,
											opacity: !ready || submit.isPending ? 0.5 : 1,
										},
									]}
								>
									{submit.isPending ? (
										<ActivityIndicator color="#fff" />
									) : (
										<Text style={styles.submitText}>
											{t("verification.documents.submit")}
										</Text>
									)}
								</Pressable>
							</View>
						</ScrollView>
					)}
				</>
			) : null}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
	tab: {
		flex: 1,
		minHeight: 44,
		alignItems: "center",
		justifyContent: "center",
		borderBottomWidth: 2,
		borderBottomColor: "transparent",
	},
	tabText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	scroll: { padding: 16, gap: 16, paddingBottom: 40 },
	footer: { gap: 10, marginTop: 4 },
	missing: { fontSize: 13, fontFamily: Fonts.body },
	submitError: { fontSize: 13, fontFamily: Fonts.body },
	submit: {
		height: 54,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	submitText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
