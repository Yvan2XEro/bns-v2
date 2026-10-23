import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { formStyles as f } from "@/src/components/seller/formStyles";
import { ProductEditorContent } from "@/src/components/seller/ProductEditorContent";
import { ProductFooter } from "@/src/components/seller/ProductFooter";
import { ProductWizardContent } from "@/src/components/seller/ProductWizardContent";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { StepSegments } from "@/src/components/ui/StepSegments";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useProductSubmit } from "@/src/hooks/useProductSubmit";
import { useMyShop, useProductDetail } from "@/src/hooks/useShops";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { type FieldIssue, serverFieldIssues } from "@/src/lib/formIssues";
import { useTranslation } from "@/src/lib/i18n";
import { getCategoryAttributes } from "@/src/lib/listingForm";
import {
	canLeaveStep,
	emptyProductForm,
	firstProductIssueStep,
	fromProductDetail,
	type ProductFormState,
	productFormIssues,
	toProductInput,
} from "@/src/lib/productForm";
import { canSeeCost } from "@/src/lib/shopRoles";

export default function ProductScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const creating = id === "new";
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showError, showSuccess, showAlert } = useAlert();
	const mine = useMyShop();
	const shop = mine.data?.shop;
	const detail = useProductDetail(creating ? undefined : id);
	const { pending, save } = useProductSubmit({
		creating,
		shopId: shop?.id,
		productId: creating ? undefined : id,
	});

	const [form, setForm] = useState<ProductFormState>(emptyProductForm);
	const [loaded, setLoaded] = useState(creating);
	const [step, setStep] = useState<1 | 2 | 3>(1);
	const [showErrors, setShowErrors] = useState(false);
	const [serverIssues, setServerIssues] = useState<FieldIssue[]>([]);
	const readOnly = shop?.status !== "active";

	// A new product half written is not dropped by a tap on the close button
	// or a back gesture: leaving asks first. Saving clears the guard.
	const navigation = useNavigation();
	// Set once the new product is saved: the guard is off on the next render,
	// and only then does the screen move to the saved product.
	const [savedId, setSavedId] = useState<string | null>(null);
	useEffect(() => {
		if (savedId) router.replace(`/seller/product/${savedId}` as never);
	}, [savedId]);
	const dirty =
		creating &&
		!savedId &&
		JSON.stringify(form) !== JSON.stringify(emptyProductForm());
	// `beforeRemove` through expo-router's own navigation: the separate
	// @react-navigation package reads a provider that is never mounted.
	useEffect(() => {
		if (!dirty) return;
		return navigation.addListener("beforeRemove", (event) => {
			event.preventDefault();
			showAlert(t("create.discardTitle"), t("create.discardMsg"), [
				{ text: t("common.cancel"), style: "cancel" },
				{
					text: t("create.discardConfirm"),
					style: "destructive",
					onPress: () => navigation.dispatch(event.data.action),
				},
			]);
		});
	}, [dirty, navigation, showAlert, t]);

	// Any edit may be the fix for what the server refused, so its verdict is
	// dropped and the form's own rules take over again.
	const editForm = useCallback<Dispatch<SetStateAction<ProductFormState>>>(
		(update) => {
			setServerIssues([]);
			setForm(update);
		},
		[],
	);

	// A new product starts from the shop's default return policy, once.
	const returnPolicyPrefilled = useRef(false);
	const defaultReturnPolicy = shop?.returnPolicy;
	useEffect(() => {
		if (!creating || !shop || returnPolicyPrefilled.current) return;
		returnPolicyPrefilled.current = true;
		if (!defaultReturnPolicy) return;
		setForm((current) =>
			current.returnPolicy
				? current
				: { ...current, returnPolicy: defaultReturnPolicy },
		);
	}, [creating, shop, defaultReturnPolicy]);

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
	const canManageCost = canSeeCost(role);
	const { photosIncluded } = useAppConfig();
	const savedPhotoCount = creating
		? null
		: (detail.data?.product.images?.length ?? 0);
	const formIssues = useMemo(
		() =>
			productFormIssues(form, attributes, {
				limit: photosIncluded,
				previousCount: savedPhotoCount,
			}),
		[form, attributes, photosIncluded, savedPhotoCount],
	);
	const visibleIssues = useMemo(
		() => [
			...serverIssues,
			...(showErrors
				? formIssues.filter(
						(issue) => !serverIssues.some((s) => s.path === issue.path),
					)
				: []),
		],
		[serverIssues, showErrors, formIssues],
	);

	const submit = () => {
		setShowErrors(true);
		const blocking = firstProductIssueStep(formIssues);
		if (blocking) {
			if (creating) setStep(blocking);
			showError(t("product.saveError"), t("formIssues.fixStep"));
			return;
		}

		const input = toProductInput(form, attributes);
		save(input, {
			onError: (error) => {
				const refused = serverFieldIssues(error);
				if (refused.length === 0) {
					showError(t("product.saveError"), resolveErrorMessage(error, t));
					return;
				}
				// Back to the step that shows the refused field, with the field
				// highlighted, instead of a banner the seller cannot act on.
				setServerIssues(refused);
				const step = firstProductIssueStep(refused);
				if (creating && step) setStep(step);
				showError(t("product.saveError"), t("formIssues.serverRefused"));
			},
			onSuccess: (result) => {
				if (creating) {
					showSuccess(
						input.status === "active"
							? t("product.publishedTitle")
							: t("product.draftTitle"),
						input.status === "active"
							? t("product.publishedMessage")
							: t("product.draftMessage"),
					);
					setSavedId(String(result.product.id));
					return;
				}
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
		});
	};

	const next = () => {
		setShowErrors(true);
		if (!canLeaveStep(formIssues, step)) return;
		setShowErrors(false);
		setStep((step + 1) as 2 | 3);
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
			{creating ? <StepSegments count={3} current={step - 1} /> : null}
			{readOnly ? (
				<View style={[styles.banner, { backgroundColor: c.dangerSoft }]}>
					<Ionicons name="ban" size={16} color={c.danger} />
					<Text style={[f.hint, { color: c.dangerText, flex: 1 }]}>
						{t("product.readOnly")}
					</Text>
				</View>
			) : null}

			<ScreenColumn width="reading">
				<KeyboardAwareScrollView
					contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}
					keyboardShouldPersistTaps="handled"
				>
					{creating ? (
						<ProductWizardContent
							form={form}
							setForm={editForm}
							step={step}
							issues={visibleIssues}
							canManageCost={canManageCost}
							onEditInfo={() => setStep(1)}
						/>
					) : (
						<ProductEditorContent
							form={form}
							setForm={editForm}
							issues={visibleIssues}
							readOnly={readOnly}
							canManageCost={canManageCost}
							listing={detail.data?.listing ?? null}
							movements={detail.data?.movements ?? []}
						/>
					)}
				</KeyboardAwareScrollView>
			</ScreenColumn>

			<ProductFooter
				creating={creating}
				step={step}
				pending={pending}
				readOnly={readOnly}
				onBack={() => setStep((s) => (s - 1) as 1 | 2)}
				onPrimary={creating && step < 3 ? next : submit}
			/>
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
});
