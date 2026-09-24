import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { formStyles as f } from "@/src/components/seller/formStyles";
import { ProductInfoStep } from "@/src/components/seller/ProductInfoStep";
import { PublishStep } from "@/src/components/seller/PublishStep";
import { VariantsStep } from "@/src/components/seller/VariantsStep";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	useCreateProduct,
	useMyShop,
	useProductDetail,
	useUpdateProduct,
} from "@/src/hooks/useShops";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { getCategoryAttributes } from "@/src/lib/listingForm";
import {
	emptyProductForm,
	fromProductDetail,
	infoIssues,
	type ProductFormState,
	toProductInput,
	variantIssues,
} from "@/src/lib/productForm";
import { canManageShop } from "@/src/lib/variants";

export default function ProductScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const creating = id === "new";
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const { showError, showSuccess } = useAlert();
	const mine = useMyShop();
	const shop = mine.data?.shop;
	const detail = useProductDetail(creating ? undefined : id);
	const create = useCreateProduct(shop?.id);
	const update = useUpdateProduct(creating ? undefined : id);

	const [form, setForm] = useState<ProductFormState>(emptyProductForm);
	const [loaded, setLoaded] = useState(creating);
	const [step, setStep] = useState<1 | 2 | 3>(1);
	const [showErrors, setShowErrors] = useState(false);
	const readOnly = shop?.status !== "active";
	// A second tap landing before `pending` re-renders must not fire a second
	// mutation: the ref is set synchronously, ahead of React's next render.
	const submittingRef = useRef(false);

	useEffect(() => {
		if (!creating && detail.data && !loaded) {
			setForm(fromProductDetail(detail.data));
			setLoaded(true);
		}
	}, [creating, detail.data, loaded]);

	const attributes = useMemo(
		() => getCategoryAttributes(form.category),
		[form.category],
	);
	const role = creating ? mine.data?.role : detail.data?.role;
	const canManageCost = canManageShop(role);
	const pending = create.isPending || update.isPending || submittingRef.current;

	const submit = () => {
		setShowErrors(true);
		if (infoIssues(form).length > 0) {
			if (creating) setStep(1);
			showError(t("product.saveError"), t("product.fixInfo"));
			return;
		}
		if (variantIssues(form).length > 0) {
			if (creating) setStep(2);
			showError(t("product.saveError"), t("product.fixVariants"));
			return;
		}
		if (submittingRef.current) return;
		submittingRef.current = true;
		const release = () => {
			submittingRef.current = false;
		};

		const input = toProductInput(form, attributes);
		const onError = (error: unknown) => {
			release();
			showError(t("product.saveError"), resolveErrorMessage(error, t));
		};
		if (creating) {
			create.mutate(input, {
				onSuccess: (result) => {
					release();
					showSuccess(
						input.status === "active"
							? t("product.publishedTitle")
							: t("product.draftTitle"),
						input.status === "active"
							? t("product.publishedMessage")
							: t("product.draftMessage"),
					);
					router.replace(`/seller/product/${result.product.id}` as never);
				},
				onError,
			});
		} else {
			update.mutate(input, {
				onSuccess: (result) => {
					release();
					// A server refusal must never leave the form showing what it
					// rejected — rebuild from the response so trimmed/normalised
					// values (and new variant ids/stock) are what the seller sees.
					if (detail.data) {
						setForm(
							fromProductDetail({
								...detail.data,
								product: result.product,
								variants: result.variants,
							}),
						);
					}
					showSuccess(t("product.savedTitle"), t("product.savedMessage"));
				},
				onError,
			});
		}
	};

	const next = () => {
		setShowErrors(true);
		if (step === 1 && infoIssues(form).length === 0) {
			setShowErrors(false);
			setStep(2);
		} else if (step === 2 && variantIssues(form).length === 0) {
			setShowErrors(false);
			setStep(3);
		}
	};

	if (!creating && (detail.isLoading || !loaded)) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<SellerHeader title={t("product.editorTitle")} />
				{detail.isError ? (
					<EmptyState
						illustration="notFound"
						title={t("product.loadError")}
						ctaLabel={t("common.retry")}
						onCta={() => detail.refetch()}
					/>
				) : (
					<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
				)}
			</SafeAreaView>
		);
	}

	const draftPill = (
		<View style={[styles.pill, { backgroundColor: c.neutralSoft }]}>
			<Text style={[styles.pillText, { color: c.neutralText }]}>
				{t(`catalogue.status_${form.status}`)}
			</Text>
		</View>
	);

	const listing = detail.data?.listing;
	const movements = detail.data?.movements ?? [];
	const locale = i18n.language?.startsWith("en") ? "en-GB" : "fr-FR";

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				icon={creating ? "close" : "arrow-back"}
				title={creating ? t("product.newTitle") : form.title}
				subtitle={creating ? (step === 1 ? shop?.name : form.title) : null}
				right={draftPill}
			/>
			{readOnly ? (
				<View style={[styles.banner, { backgroundColor: c.dangerSoft }]}>
					<Ionicons name="ban" size={16} color={c.danger} />
					<Text style={[f.hint, { color: c.dangerText, flex: 1 }]}>
						{t("product.readOnly")}
					</Text>
				</View>
			) : null}

			<KeyboardAwareScrollView
				contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}
				keyboardShouldPersistTaps="handled"
			>
				{creating ? (
					<>
						<View>
							<Text style={[f.hint, { color: c.muted }]}>
								{t("product.stepOf", { step })}
							</Text>
							<Text style={[styles.stepTitle, { color: c.text }]}>
								{t(`product.step${step}Title`)}
							</Text>
						</View>
						{step === 1 ? (
							<ProductInfoStep
								form={form}
								setForm={setForm}
								showErrors={showErrors}
							/>
						) : null}
						{step === 2 ? (
							<VariantsStep
								form={form}
								setForm={setForm}
								canManageCost={canManageCost}
							/>
						) : null}
						{step === 3 ? (
							<PublishStep
								form={form}
								setForm={setForm}
								statuses={["active", "draft"]}
								onEditInfo={() => setStep(1)}
							/>
						) : null}
						{step === 2 && showErrors && variantIssues(form).length > 0 ? (
							<Text style={f.error}>{t("product.fixVariants")}</Text>
						) : null}
					</>
				) : (
					<>
						<PublishStep
							form={form}
							setForm={setForm}
							statuses={["active", "archived", "draft"]}
							readOnly={readOnly}
						/>
						{listing ? (
							<Pressable
								onPress={() => router.push(`/listing/${listing.id}` as never)}
								style={[
									f.card,
									styles.listingRow,
									{ backgroundColor: c.card, borderColor: c.border },
								]}
								accessibilityRole="button"
								accessibilityLabel={t("product.viewListing")}
							>
								<Ionicons name="globe-outline" size={18} color={c.primary} />
								<Text style={[f.label, { color: c.text, flex: 1 }]}>
									{t("product.listingStats", {
										views: listing.views,
										favorites: listing.favorites,
									})}
								</Text>
								<Text style={[f.label, { color: c.primary }]}>
									{t("product.viewListing")}
								</Text>
							</Pressable>
						) : null}
						<VariantsStep
							form={form}
							setForm={setForm}
							editing
							readOnly={readOnly}
							canManageCost={canManageCost}
						/>
						<ProductInfoStep
							form={form}
							setForm={setForm}
							showErrors={showErrors}
						/>
						{movements.length > 0 ? (
							<View
								style={[
									f.card,
									{ backgroundColor: c.card, borderColor: c.border },
								]}
							>
								<Text style={[f.sectionTitle, { color: c.text }]}>
									{t("product.latestMovements")}
								</Text>
								{movements.map((m) => (
									<View key={m.id} style={f.row}>
										<Text
											style={[
												styles.qty,
												{
													color: m.quantity > 0 ? c.successText : c.dangerText,
												},
											]}
										>
											{m.quantity > 0
												? `+${m.quantity}`
												: `−${Math.abs(m.quantity)}`}
										</Text>
										<View style={{ flex: 1 }}>
											<Text style={[f.label, { color: c.text }]}>
												{t(`stock.type_${m.type}`)}
												{m.variant.label ? ` · ${m.variant.label}` : ""}
											</Text>
											<Text style={[f.hint, { color: c.muted }]}>
												{[
													formatDate(
														m.createdAt,
														{ day: "numeric", month: "short" },
														locale,
													),
													m.note,
												]
													.filter(Boolean)
													.join(" · ")}
											</Text>
										</View>
									</View>
								))}
							</View>
						) : null}
					</>
				)}
			</KeyboardAwareScrollView>

			<View
				style={[
					styles.footer,
					{ backgroundColor: c.card, borderTopColor: c.border },
				]}
			>
				{creating && step > 1 ? (
					<Pressable
						onPress={() => setStep((s) => (s - 1) as 1 | 2)}
						style={[styles.back, { borderColor: c.border }]}
						accessibilityRole="button"
						accessibilityLabel={t("product.back")}
					>
						<Text style={[f.label, { color: c.text }]}>
							{t("product.back")}
						</Text>
					</Pressable>
				) : null}
				<Pressable
					onPress={creating && step < 3 ? next : submit}
					disabled={pending || readOnly}
					style={[
						styles.primary,
						{
							backgroundColor: creating && step === 3 ? c.sell : c.primary,
							opacity: readOnly ? 0.5 : 1,
						},
					]}
					accessibilityRole="button"
					accessibilityLabel={
						creating
							? step < 3
								? t("product.continue")
								: t("product.publish")
							: t("product.save")
					}
				>
					{pending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.primaryText}>
							{creating
								? step < 3
									? t("product.continue")
									: t("product.publish")
								: t("product.save")}
						</Text>
					)}
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
	pillText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	banner: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		margin: 16,
		marginBottom: 0,
		padding: 10,
		borderRadius: 10,
	},
	stepTitle: { fontSize: 22, fontFamily: Fonts.displayExtrabold },
	listingRow: { flexDirection: "row", alignItems: "center" },
	qty: { width: 40, fontSize: 15, fontFamily: Fonts.displayBold },
	footer: {
		flexDirection: "row",
		gap: 10,
		padding: 16,
		paddingBottom: 28,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	back: {
		height: 52,
		paddingHorizontal: 18,
		borderRadius: 14,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	primary: {
		flex: 1,
		height: 52,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	primaryText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
