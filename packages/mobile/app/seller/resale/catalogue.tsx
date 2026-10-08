import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useReducer } from "react";
import { Controller, useForm } from "react-hook-form";
import {
	ActivityIndicator,
	Alert,
	Image,
	Keyboard,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { useDebouncedValue } from "@/src/components/sellerOrders/useClock";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import {
	useAcceptResaleTerms,
	useCreateResaleListing,
	useCurrentResaleTerms,
	useRequestResaleLink,
	useResaleCatalogue,
} from "@/src/hooks/useResale";
import { ApiError } from "@/src/lib/api";
import { useTranslation } from "@/src/lib/i18n";
import { formatXaf } from "@/src/lib/orderMoney";
import type {
	CreateResaleListingInput,
	ResaleCatalogueProduct,
	ResaleCatalogueVariant,
} from "../../../../api/src/contracts/resale";

type ScreenState = { search: string; accepted: boolean };
function reducer(state: ScreenState, patch: Partial<ScreenState>): ScreenState {
	return { ...state, ...patch };
}

const priceSchema = z.object({
	prices: z.array(
		z.object({
			variantId: z.string().min(1),
			price: z.number().int().positive(),
		}),
	),
});
type PriceForm = z.infer<typeof priceSchema>;

function plainText(value: unknown): string {
	if (typeof value === "string") return value;
	if (!value || typeof value !== "object") return "";
	if ("text" in value && typeof value.text === "string") return value.text;
	if (!("children" in value) || !Array.isArray(value.children)) return "";
	return value.children.map(plainText).filter(Boolean).join("\n");
}

function productImage(product: ResaleCatalogueProduct): string | null {
	const image = product.images?.[0]?.image;
	if (typeof image === "string") return image;
	return image?.thumbnailURL ?? image?.url ?? null;
}

export default function ResaleCatalogueScreen() {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const { shop, isLoading: shopLoading } = useActiveShop();
	const [state, patch] = useReducer(reducer, { search: "", accepted: false });
	const search = useDebouncedValue(state.search.trim(), 250);
	const catalogue = useResaleCatalogue(shop?.shopId, search);
	const terms = useCurrentResaleTerms();
	const acceptTerms = useAcceptResaleTerms(shop?.shopId ?? "");
	const requestLink = useRequestResaleLink(shop?.shopId ?? "");
	const createListing = useCreateResaleListing(shop?.shopId ?? "");
	const locale = i18n.language?.startsWith("en") ? "en" : "fr";
	const needsTerms =
		catalogue.error instanceof ApiError &&
		catalogue.error.code === "resale.termsNotAccepted";

	if (shopLoading || !shop) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<ActivityIndicator style={styles.spinner} color={c.primary} />
			</SafeAreaView>
		);
	}

	const requestAccess = (product: ResaleCatalogueProduct) => {
		const version = terms.data?.version;
		if (!version) return;
		requestLink.mutate(
			{ supplierShop: product.supplier.id, acceptTermsVersion: version },
			{
				onSuccess: () =>
					Alert.alert(
						t("sellerResale.requestedTitle"),
						t("sellerResale.requestedBody"),
					),
				onError: (error) =>
					Alert.alert(t("sellerResale.actionFailed"), error.message),
			},
		);
	};

	const rows = catalogue.data?.products ?? [];
	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
			<SellerHeader
				title={t("sellerResale.catalogueTitle")}
				subtitle={shop.name}
			/>
			<View
				style={[
					styles.search,
					{ backgroundColor: c.input, borderColor: c.border },
				]}
			>
				<Ionicons name="search" size={18} color={c.muted} />
				<TextInput
					value={state.search}
					onChangeText={(value) => patch({ search: value })}
					placeholder={t("sellerResale.catalogueSearch")}
					placeholderTextColor={c.muted}
					accessibilityLabel={t("sellerResale.catalogueSearch")}
					maxLength={120}
					returnKeyType="search"
					style={[styles.searchInput, { color: c.text }]}
				/>
				{state.search ? (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={t("search.clearSearch")}
						onPress={() => patch({ search: "" })}
					>
						<Ionicons name="close-circle" size={20} color={c.muted} />
					</Pressable>
				) : null}
			</View>
			<Pressable
				accessibilityRole="button"
				onPress={() => router.push("/seller/resale/purchase-orders")}
				style={[
					styles.ordersLink,
					{ borderColor: c.border, backgroundColor: c.card },
				]}
			>
				<Text style={[styles.ordersText, { color: c.primary }]}>
					{t("sellerResale.purchaseOrdersLink")}
				</Text>
				<Ionicons name="chevron-forward" size={17} color={c.primary} />
			</Pressable>
			{needsTerms ? (
				<TermsCard
					body={locale === "fr" ? terms.data?.bodyFr : terms.data?.bodyEn}
					version={terms.data?.version}
					accepted={state.accepted}
					loading={terms.isLoading || acceptTerms.isPending}
					title={t("sellerResale.termsTitle")}
					acceptLabel={t("sellerResale.acceptTerms")}
					buttonLabel={t("sellerResale.continue")}
					onToggle={() => patch({ accepted: !state.accepted })}
					onAccept={() => {
						const version = terms.data?.version;
						if (!state.accepted || !version) return;
						acceptTerms.mutate(
							{ version, locale },
							{ onSuccess: () => catalogue.refetch() },
						);
					}}
				/>
			) : null}
			{catalogue.isLoading ? (
				<ActivityIndicator style={styles.spinner} color={c.primary} />
			) : null}
			{catalogue.isError && !needsTerms ? (
				<EmptyState
					illustration="notFound"
					title={t("sellerResale.loadError")}
					ctaLabel={t("common.retry")}
					onCta={() => catalogue.refetch()}
				/>
			) : null}
			{catalogue.data && rows.length === 0 ? (
				<EmptyState
					illustration={search ? "searching" : "empty"}
					title={
						search
							? t("sellerResale.catalogueEmptySearch")
							: t("sellerResale.catalogueEmpty")
					}
				/>
			) : null}
			<FlashList
				data={rows}
				keyExtractor={(item) => item.productId}
				contentContainerStyle={styles.list}
				ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
				renderItem={({ item }) => (
					<CatalogueProductCard
						product={item}
						locale={locale}
						isPending={createListing.isPending || requestLink.isPending}
						t={t}
						onRequest={() => requestAccess(item)}
						onCreate={(input) =>
							createListing.mutate(input, {
								onSuccess: () =>
									Alert.alert(
										t("sellerResale.createdTitle"),
										t("sellerResale.createdBody"),
									),
								onError: (error) =>
									Alert.alert(t("sellerResale.actionFailed"), error.message),
							})
						}
					/>
				)}
				refreshControl={
					<RefreshControl
						refreshing={catalogue.isRefetching}
						onRefresh={() => catalogue.refetch()}
						tintColor={c.primary}
					/>
				}
			/>
		</SafeAreaView>
	);
}

function TermsCard({
	body,
	version,
	accepted,
	loading,
	title,
	acceptLabel,
	buttonLabel,
	onToggle,
	onAccept,
}: {
	body: unknown;
	version?: string;
	accepted: boolean;
	loading: boolean;
	title: string;
	acceptLabel: string;
	buttonLabel: string;
	onToggle: () => void;
	onAccept: () => void;
}) {
	const c = useShopTheme();
	return (
		<View
			style={[styles.terms, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.cardTitle, { color: c.text }]}>{title}</Text>
			<Text style={[styles.termsBody, { color: c.body }]}>
				{plainText(body) || version}
			</Text>
			<Pressable
				accessibilityRole="checkbox"
				accessibilityState={{ checked: accepted }}
				onPress={onToggle}
				style={styles.acceptRow}
			>
				<Ionicons
					name={accepted ? "checkbox" : "square-outline"}
					size={21}
					color={c.primary}
				/>
				<Text style={[styles.body, { color: c.text }]}>{acceptLabel}</Text>
			</Pressable>
			<Pressable
				disabled={!accepted || !version || loading}
				onPress={onAccept}
				style={[
					styles.primaryButton,
					{
						backgroundColor: c.primary,
						opacity: accepted && version && !loading ? 1 : 0.55,
					},
				]}
			>
				{loading ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.primaryText}>{buttonLabel}</Text>
				)}
			</Pressable>
		</View>
	);
}

function CatalogueProductCard({
	product,
	locale,
	isPending,
	t,
	onRequest,
	onCreate,
}: {
	product: ResaleCatalogueProduct;
	locale: "fr" | "en";
	isPending: boolean;
	t: (key: string, options?: Record<string, string | number>) => string;
	onRequest: () => void;
	onCreate: (input: CreateResaleListingInput) => void;
}) {
	const c = useShopTheme();
	const mustRequest =
		product.approvalRequired && product.linkStatus !== "approved";
	const form = useForm<PriceForm>({
		resolver: zodResolver(priceSchema),
		defaultValues: {
			prices: product.variants.map((variant) => ({
				variantId: variant.id,
				price: variant.suggestedRetailPrice ?? variant.minRetailPrice ?? 1,
			})),
		},
	});
	const submit = form.handleSubmit((values) => {
		const belowMinimum = values.prices.findIndex((price) => {
			const variant = product.variants.find(
				(row) => row.id === price.variantId,
			);
			return (
				variant?.minRetailPrice !== null &&
				variant?.minRetailPrice !== undefined &&
				price.price < variant.minRetailPrice
			);
		});
		if (belowMinimum >= 0) {
			form.setError(`prices.${belowMinimum}.price`, {
				message: t("sellerResale.belowMinimum"),
			});
			return;
		}
		Keyboard.dismiss();
		onCreate({
			productId: product.productId,
			prices: values.prices,
			desiredStatus: "published",
		});
	});
	const image = productImage(product);
	return (
		<View
			style={[
				styles.productCard,
				{ backgroundColor: c.card, borderColor: c.border },
			]}
		>
			<View style={styles.productHeader}>
				{image ? (
					<Image source={{ uri: image }} style={styles.productImage} />
				) : (
					<View
						style={[
							styles.productImage,
							styles.imagePlaceholder,
							{ backgroundColor: c.input },
						]}
					>
						<Ionicons name="image-outline" size={25} color={c.muted} />
					</View>
				)}
				<View style={styles.productInfo}>
					<Text style={[styles.productTitle, { color: c.text }]}>
						{product.title}
					</Text>
					<Text style={[styles.body, { color: c.body }]}>
						{t("sellerResale.supplierName", { name: product.supplier.name })}
					</Text>
					{product.description ? (
						<Text
							numberOfLines={2}
							style={[styles.description, { color: c.body }]}
						>
							{product.description}
						</Text>
					) : null}
				</View>
			</View>
			{mustRequest ? (
				<Pressable
					disabled={isPending || product.linkStatus === "requested"}
					onPress={onRequest}
					style={[
						styles.primaryButton,
						{
							backgroundColor: c.primary,
							opacity: product.linkStatus === "requested" ? 0.55 : 1,
						},
					]}
				>
					<Text style={styles.primaryText}>
						{product.linkStatus === "requested"
							? t("sellerResale.requestPending")
							: t("sellerResale.requestAccess")}
					</Text>
				</Pressable>
			) : (
				<View style={styles.prices}>
					{product.variants.map((variant, index) => (
						<VariantPrice
							key={variant.id}
							variant={variant}
							index={index}
							control={form.control}
							locale={locale}
							t={t}
						/>
					))}
					<Pressable
						disabled={isPending || product.variants.length === 0}
						onPress={() => void submit()}
						style={[
							styles.primaryButton,
							{
								backgroundColor: c.primary,
								opacity: isPending || product.variants.length === 0 ? 0.55 : 1,
							},
						]}
					>
						{isPending ? (
							<ActivityIndicator color="#fff" />
						) : (
							<Text style={styles.primaryText}>
								{t("sellerResale.publishResale")}
							</Text>
						)}
					</Pressable>
				</View>
			)}
		</View>
	);
}

function VariantPrice({
	variant,
	index,
	control,
	locale,
	t,
}: {
	variant: ResaleCatalogueVariant;
	index: number;
	control: ReturnType<typeof useForm<PriceForm>>["control"];
	locale: "fr" | "en";
	t: (key: string, options?: Record<string, string | number>) => string;
}) {
	const c = useShopTheme();
	const label =
		variant.sku ?? t("sellerResale.variantNumber", { number: index + 1 });
	return (
		<View style={styles.variantRow}>
			<View style={styles.variantInfo}>
				<Text style={[styles.body, { color: c.text }]}>{label}</Text>
				{variant.minRetailPrice ? (
					<Text style={[styles.hint, { color: c.muted }]}>
						{t("sellerResale.minimumPrice", {
							price: formatXaf(variant.minRetailPrice, locale),
						})}
					</Text>
				) : null}
			</View>
			<Controller
				control={control}
				name={`prices.${index}.price`}
				render={({ field, fieldState }) => (
					<View style={styles.priceInputWrap}>
						<TextInput
							value={String(field.value)}
							onChangeText={(value) =>
								field.onChange(Number(value.replace(/[^0-9]/g, "")))
							}
							keyboardType="number-pad"
							accessibilityLabel={t("sellerResale.resalePrice", {
								variant: label,
							})}
							style={[
								styles.priceInput,
								{
									backgroundColor: c.input,
									borderColor: fieldState.error ? "#DC2626" : c.border,
									color: c.text,
								},
							]}
						/>
						{fieldState.error ? (
							<Text style={styles.fieldError}>{fieldState.error.message}</Text>
						) : null}
					</View>
				)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { marginTop: 28 },
	search: {
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1,
		flexDirection: "row",
		gap: 9,
		marginHorizontal: 16,
		marginTop: 12,
		paddingHorizontal: 12,
		minHeight: 46,
	},
	searchInput: {
		flex: 1,
		fontFamily: Fonts.body,
		fontSize: 14,
		paddingVertical: 10,
	},
	ordersLink: {
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1,
		flexDirection: "row",
		justifyContent: "space-between",
		marginHorizontal: 16,
		marginTop: 10,
		minHeight: 44,
		paddingHorizontal: 14,
	},
	ordersText: { fontFamily: Fonts.bodySemibold, fontSize: 14 },
	list: { padding: 16, paddingBottom: 36 },
	productCard: { borderRadius: 16, borderWidth: 1, gap: 14, padding: 14 },
	productHeader: { flexDirection: "row", gap: 12 },
	productImage: { borderRadius: 10, height: 74, width: 74 },
	imagePlaceholder: { alignItems: "center", justifyContent: "center" },
	productInfo: { flex: 1, gap: 4 },
	productTitle: { fontFamily: Fonts.displaySemibold, fontSize: 16 },
	body: { fontFamily: Fonts.body, fontSize: 13 },
	description: {
		fontFamily: Fonts.body,
		fontSize: 12,
		lineHeight: 17,
		marginTop: 2,
	},
	prices: { gap: 10 },
	variantRow: {
		alignItems: "center",
		flexDirection: "row",
		gap: 10,
		justifyContent: "space-between",
	},
	variantInfo: { flex: 1, gap: 3 },
	hint: { fontFamily: Fonts.body, fontSize: 11 },
	priceInputWrap: { alignItems: "flex-end", width: 130 },
	priceInput: {
		borderRadius: 9,
		borderWidth: 1,
		fontFamily: Fonts.bodyMedium,
		minHeight: 42,
		paddingHorizontal: 10,
		textAlign: "right",
		width: "100%",
	},
	fieldError: {
		color: "#DC2626",
		fontFamily: Fonts.body,
		fontSize: 10,
	},
	primaryButton: {
		alignItems: "center",
		borderRadius: 10,
		justifyContent: "center",
		minHeight: 44,
		paddingHorizontal: 14,
	},
	primaryText: { color: "#fff", fontFamily: Fonts.bodySemibold, fontSize: 14 },
	terms: {
		borderRadius: 14,
		borderWidth: 1,
		gap: 12,
		margin: 16,
		marginBottom: 0,
		padding: 14,
	},
	cardTitle: { fontFamily: Fonts.displaySemibold, fontSize: 16 },
	termsBody: {
		fontFamily: Fonts.body,
		fontSize: 12,
		lineHeight: 18,
		maxHeight: 150,
	},
	acceptRow: {
		alignItems: "center",
		flexDirection: "row",
		gap: 8,
		minHeight: 44,
	},
});
