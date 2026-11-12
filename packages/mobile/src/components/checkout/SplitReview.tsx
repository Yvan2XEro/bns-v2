import { Ionicons } from "@expo/vector-icons";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
	AccessibilityInfo,
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useCart } from "@/src/hooks/useCart";
import { useSplitPlace, useSplitQuote } from "@/src/hooks/useCheckoutGroup";
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { newIdempotencyKey } from "@/src/lib/checkoutFlow";
import { districtName } from "@/src/lib/checkoutForm";
import {
	isSplitCart,
	splitPlaceBody,
	unavailableReasonKey,
} from "@/src/lib/checkoutGroupFlow";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import type {
	AddressInput,
	PaymentMethod,
	SplitQuoteGroup,
	SplitQuoteView,
} from "@/src/types/order";
import { CheckoutButton } from "./CheckoutButton";
import { useAppLocale, useCheckoutFlow } from "./CheckoutProvider";
import { DeliveryOptionCard } from "./DeliveryOptionCard";
import { DetailSkeleton } from "./DetailSkeleton";
import { FormError } from "./FormError";
import { PaymentMethodPicker } from "./PaymentMethodPicker";
import { PinnedActionBar } from "./PinnedActionBar";
import { LinkButton } from "./SummaryParts";
import { TotalTag } from "./TotalTag";

function Separator() {
	return <View style={styles.separator} />;
}

/**
 * The review of a multi-shop cart: one quote, one card per group with its own
 * delivery pick, one address for all, one acceptance. Every figure is the
 * server's; the buyer picks, the server prices.
 *
 * A re-quote (a new delivery pick, another payment method) keeps the last
 * answer on screen, dimmed, until the new one lands: the list never collapses
 * into a spinner under the buyer's thumb, and a stale figure is never shown
 * at full strength or placed.
 */
export function SplitReview({ address }: { address: AddressInput }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useAppLocale();
	const { protectedPaymentEnabled, buyerProtection } = useAppConfig();
	const quote = useSplitQuote();
	const place = useSplitPlace();
	const { addressChoice } = useCheckoutFlow();
	const cart = useCart();
	const list = useRef<FlashListRef<SplitQuoteGroup>>(null);
	const [method, setMethod] = useState<PaymentMethod>("cod");
	const [picks, setPicks] = useState<Record<string, string>>({});
	const [accepted, setAccepted] = useState(false);
	// Set when the server answered `checkout.quoteChanged`: the only re-quote
	// that unticks the terms, and the buyer is told why.
	const [quoteChanged, setQuoteChanged] = useState(false);
	const [termsNudge, setTermsNudge] = useState(false);
	// The method the shown figures were priced for, so a protection fee is
	// only ever read off a mobile_money answer.
	const [pricedMethod, setPricedMethod] = useState<PaymentMethod>("cod");
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		newIdempotencyKey(),
	);
	// A mutation forgets its answer the moment the next one starts.
	const [lastView, setLastView] = useState<SplitQuoteView | undefined>();
	const view: SplitQuoteView | undefined = quote.data ?? lastView;
	const stale = quote.isPending || quote.isError;

	const requestQuote = (
		nextMethod: PaymentMethod,
		nextPicks: Record<string, string>,
	) => {
		quote.mutate(
			{
				address,
				paymentMethod: nextMethod,
				locale,
				deliveryByGroup: nextPicks,
			},
			{
				onSuccess: (fresh) => {
					setLastView(fresh);
					setPricedMethod(nextMethod);
				},
			},
		);
	};
	// biome-ignore lint/correctness/useExhaustiveDependencies: the first quote is the mount's
	useEffect(() => requestQuote(method, picks), []);

	const choosePayment = (next: PaymentMethod) => {
		setMethod(next);
		requestQuote(next, picks);
	};
	const pick = (groupKey: string, optionId: string) => {
		const next = { ...picks, [groupKey]: optionId };
		setPicks(next);
		requestQuote(method, next);
	};

	const placeOrders = () => {
		if (!view || stale) return;
		if (!accepted) {
			setTermsNudge(true);
			list.current?.scrollToEnd({ animated: true });
			AccessibilityInfo.announceForAccessibility(t("checkout.acceptRequired"));
			return;
		}
		const body = splitPlaceBody({
			address,
			quote: view,
			paymentMethod: method,
			deliveryByGroup: picks,
			accepted,
			idempotencyKey,
			locale,
		});
		if (!body) return;
		const withSave = addressChoice.save
			? { ...body, saveAddress: { label: addressChoice.save.label.trim() } }
			: body;
		place.mutate(withSave, {
			onSuccess: (placed) => {
				router.dismissAll();
				router.replace({
					pathname: "/purchases/group/[group]",
					params: { group: placed.checkoutGroup, placed: "1" },
				});
			},
			onError: (error) => {
				if (
					error instanceof ApiError &&
					error.code === ERROR_CODES.checkoutQuoteChanged
				) {
					setIdempotencyKey(newIdempotencyKey());
					setAccepted(false);
					setQuoteChanged(true);
					requestQuote(method, picks);
				}
			},
		});
	};

	// The split quote folds the buyer protection fee into each group total
	// without stating it; this screen never derives it (the server decides
	// money), so it only says the fee is in there.
	const showsFee = pricedMethod === "mobile_money" && method === "mobile_money";
	const shopOf = (groupKey: string) => {
		const groups = cart.data && isSplitCart(cart.data) ? cart.data.groups : [];
		return (
			groups.find((group) => group.groupKey === groupKey)?.storefrontShop
				.name ?? null
		);
	};

	const methodPicker = protectedPaymentEnabled ? (
		<PaymentMethodPicker
			method={method}
			fee={null}
			buyerProtection={buyerProtection}
			locale={locale}
			onChoose={choosePayment}
		/>
	) : null;

	const quoteError = quote.isError ? (
		<View style={styles.stack}>
			<FormError message={resolveErrorMessage(quote.error, t)} />
			<CheckoutButton
				variant="outline"
				icon="refresh"
				label={t("checkout.retryQuote")}
				onPress={() => requestQuote(method, picks)}
			/>
		</View>
	) : null;

	if (!view) {
		return (
			<View>
				{methodPicker ? (
					<View style={styles.pickerPad}>{methodPicker}</View>
				) : null}
				{quote.isError ? (
					<View style={styles.pad}>{quoteError}</View>
				) : (
					<DetailSkeleton cards={1} />
				)}
			</View>
		);
	}

	const placeError =
		place.error &&
		!(
			place.error instanceof ApiError &&
			place.error.code === ERROR_CODES.checkoutQuoteChanged
		)
			? place.error
			: null;
	const canPlace = view.groups.length > 0 && !stale;
	const grand = formatPrice(view.grandTotal, locale);

	return (
		<View style={styles.flex}>
			<FlashList<SplitQuoteGroup>
				ref={list}
				data={view.groups}
				keyExtractor={(group) => group.groupKey}
				extraData={{ picks, stale, method, showsFee }}
				contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
				ItemSeparatorComponent={Separator}
				ListHeaderComponent={
					<View style={styles.header}>
						{quoteChanged ? (
							<View
								style={[styles.notice, { backgroundColor: c.warningSoft }]}
								accessibilityRole="alert"
							>
								<Ionicons
									name="alert-circle"
									size={18}
									color={c.warningText}
									style={styles.noticeIcon}
								/>
								<View style={[styles.flex, styles.noticeLines]}>
									<Text style={[styles.noticeTitle, { color: c.warningText }]}>
										{t("checkout.quoteChanged")}
									</Text>
									<Text style={[styles.meta, { color: c.warningText }]}>
										{t("checkout.quoteChangedBody")}
									</Text>
								</View>
							</View>
						) : null}
						{methodPicker}
						<View
							style={[
								styles.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<View style={styles.row}>
								<Text
									style={[styles.strongLabel, { color: c.text }]}
									accessibilityRole="header"
								>
									{t("checkout.deliverTo")}
								</Text>
								<LinkButton
									label={t("checkout.editAddress")}
									onPress={() => router.dismissTo("/checkout/address")}
								/>
							</View>
							<Text style={[styles.meta, { color: c.body }]}>
								{`${address.recipientName} · ${address.phone}`}
							</Text>
							<Text style={[styles.meta, { color: c.muted }]}>
								{address.landmark
									? `${districtName(address)} — ${address.landmark}`
									: districtName(address)}
							</Text>
						</View>
					</View>
				}
				renderItem={({ item: group }) => {
					const chosen = picks[group.groupKey] ?? group.selectedOptionId;
					return (
						<View
							style={[
								styles.card,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<Text
								style={[styles.title, { color: c.text }]}
								accessibilityRole="header"
							>
								{t("checkoutGroup.deliveryFor", {
									shop: group.storefrontShop.name,
								})}
							</Text>
							<View accessibilityRole="radiogroup" style={styles.options}>
								{group.delivery.options.map((option) => (
									<DeliveryOptionCard
										key={option.optionId}
										option={option}
										checked={option.optionId === chosen}
										locale={locale}
										selectable={method !== "cod" || option.codAllowed}
										onSelect={() => pick(group.groupKey, option.optionId)}
									/>
								))}
							</View>
							<GroupItems group={group} locale={locale} />
							<View style={[styles.divider, { backgroundColor: c.border }]} />
							<View style={[styles.amounts, stale ? styles.dim : null]}>
								<AmountRow
									label={t("checkoutGroup.groupSubtotal")}
									value={formatPrice(group.subtotal, locale)}
								/>
								<AmountRow
									label={t("checkoutGroup.groupDelivery")}
									value={
										group.deliveryFee === 0
											? t("checkout.free")
											: formatPrice(group.deliveryFee, locale)
									}
								/>
								{showsFee ? (
									<AmountRow
										label={t("payments.summary_protectionFee")}
										value={t("checkoutGroup.feeIncluded")}
									/>
								) : null}
								<AmountRow
									label={t("checkoutGroup.groupTotal")}
									value={formatPrice(group.total, locale)}
									strong
								/>
							</View>
						</View>
					);
				}}
				ListFooterComponent={
					<View style={styles.footer}>
						{view.unavailableGroups.length > 0 ? (
							<View
								style={[styles.notice, { backgroundColor: c.warningSoft }]}
								accessibilityRole="alert"
							>
								<Ionicons
									name="information-circle"
									size={18}
									color={c.warningText}
									style={styles.noticeIcon}
								/>
								<View style={[styles.flex, styles.noticeLines]}>
									<Text style={[styles.noticeTitle, { color: c.warningText }]}>
										{t("checkoutGroup.unavailableTitle")}
									</Text>
									{view.unavailableGroups.map((entry) => {
										const shop = shopOf(entry.groupKey);
										const reason = t(unavailableReasonKey(entry.reason));
										return (
											<Text
												key={entry.groupKey}
												style={[styles.meta, { color: c.warningText }]}
											>
												{shop ? `${shop} : ${reason}` : reason}
											</Text>
										);
									})}
									<View style={styles.noticeActions}>
										<LinkButton
											label={t("checkout.editCart")}
											onPress={() => router.navigate("/cart")}
										/>
										<LinkButton
											label={t("checkout.editAddress")}
											onPress={() => router.dismissTo("/checkout/address")}
										/>
									</View>
								</View>
							</View>
						) : null}
						<View
							style={[styles.grand, { borderTopColor: c.border }]}
							accessible
							accessibilityLabel={
								quote.isPending
									? t("checkout.loadingQuote")
									: `${t("checkoutGroup.grandTotal")} ${grand}`
							}
							accessibilityLiveRegion="polite"
						>
							<Text style={[styles.grandLabel, { color: c.text }]}>
								{t("checkoutGroup.grandTotal")}
							</Text>
							{quote.isPending ? (
								<View style={styles.requote}>
									<ActivityIndicator color={c.primary} size="small" />
									<Text style={[styles.meta, { color: c.muted }]}>
										{t("checkout.loadingQuote")}
									</Text>
								</View>
							) : (
								<View style={stale ? styles.dim : null}>
									<TotalTag amount={grand} />
								</View>
							)}
						</View>
						{quoteError}
						<Pressable
							onPress={() => {
								setTermsNudge(false);
								setAccepted(!accepted);
							}}
							accessibilityRole="checkbox"
							accessibilityLabel={t("checkout.acceptTerms")}
							accessibilityState={{ checked: accepted }}
							style={styles.accept}
						>
							<Ionicons
								name={accepted ? "checkbox" : "square-outline"}
								size={24}
								color={accepted ? c.primary : c.muted}
							/>
							<Text style={[styles.acceptText, { color: c.text }]}>
								{t("checkout.acceptTerms")}
							</Text>
						</Pressable>
						<FormError
							message={
								termsNudge && !accepted ? t("checkout.acceptRequired") : null
							}
						/>
						<FormError
							message={placeError ? resolveErrorMessage(placeError, t) : null}
						/>
					</View>
				}
			/>
			<PinnedActionBar>
				<CheckoutButton
					label={
						stale
							? t("checkoutGroup.placeOrders")
							: t("checkoutGroup.placeOrdersTotal", { total: grand })
					}
					onPress={placeOrders}
					disabled={!canPlace}
					loading={place.isPending}
				/>
			</PinnedActionBar>
		</View>
	);
}

/** The group's lines, folded by default: the delivery pick comes first. */
function GroupItems({
	group,
	locale,
}: {
	group: SplitQuoteGroup;
	locale: "fr" | "en";
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const count = group.items.length;
	return (
		<View style={styles.items}>
			<Pressable
				onPress={() => setOpen(!open)}
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				style={styles.itemsToggle}
			>
				<Text style={[styles.strongLabel, styles.flex, { color: c.text }]}>
					{t("checkoutGroup.itemsToggle", { count })}
				</Text>
				<Ionicons
					name={open ? "chevron-up" : "chevron-down"}
					size={18}
					color={c.muted}
				/>
			</Pressable>
			{open ? (
				<View style={styles.itemsList}>
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("purchases.soldBy", { shop: group.fulfillingShop.name })}
					</Text>
					{group.items.map((line) => (
						<View key={`${line.title}-${line.variantLabel}`} style={styles.row}>
							<View style={styles.flex}>
								<Text style={[styles.meta, { color: c.text }]}>
									{line.title}
								</Text>
								<Text style={[styles.meta, { color: c.muted }]}>
									{`${t("checkout.quantity", { quantity: line.quantity })} × ${formatPrice(line.unitPrice, locale)}`}
								</Text>
							</View>
							<Text style={[styles.value, { color: c.text }]}>
								{formatPrice(line.lineSubtotal, locale)}
							</Text>
						</View>
					))}
				</View>
			) : null}
		</View>
	);
}

function AmountRow({
	label,
	value,
	strong = false,
}: {
	label: string;
	value: string;
	strong?: boolean;
}) {
	const c = useShopTheme();
	return (
		<View style={styles.row}>
			<Text
				style={[
					strong ? styles.strongLabel : styles.meta,
					{ color: strong ? c.text : c.body },
				]}
			>
				{label}
			</Text>
			<Text
				style={[strong ? styles.strongValue : styles.value, { color: c.text }]}
			>
				{value}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	separator: { height: 16 },
	stack: { gap: 10 },
	pad: { padding: 16 },
	pickerPad: { paddingHorizontal: 16, paddingTop: 16 },
	header: { gap: 16, marginBottom: 16 },
	items: { gap: 8 },
	itemsToggle: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minHeight: 44,
	},
	itemsList: { gap: 10 },
	noticeActions: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
	card: {
		padding: 16,
		gap: 12,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	options: { gap: 10 },
	divider: { height: StyleSheet.hairlineWidth },
	amounts: { gap: 6 },
	dim: { opacity: 0.45 },
	title: { fontSize: 18, lineHeight: 23, fontFamily: Fonts.displayBold },
	meta: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.body },
	value: {
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
		fontVariant: ["tabular-nums"],
	},
	strongLabel: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	strongValue: {
		fontSize: 17,
		fontFamily: Fonts.displayExtrabold,
		fontVariant: ["tabular-nums"],
	},
	footer: { gap: 12, marginTop: 16 },
	notice: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 12 },
	noticeIcon: { marginTop: 1 },
	noticeLines: { gap: 4 },
	noticeTitle: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	grand: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		minHeight: 56,
		paddingTop: 14,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	grandLabel: { fontSize: 18, fontFamily: Fonts.displayBold, flexShrink: 1 },
	requote: { flexDirection: "row", alignItems: "center", gap: 8 },
	acceptText: { flex: 1, fontSize: 15, lineHeight: 21, fontFamily: Fonts.body },
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 12,
	},
	accept: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 48,
	},
});
