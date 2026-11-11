import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useSplitPlace, useSplitQuote } from "@/src/hooks/useCheckoutGroup";
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { newIdempotencyKey } from "@/src/lib/checkoutFlow";
import {
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
	const insets = useSafeAreaInsets();
	const { protectedPaymentEnabled, buyerProtection } = useAppConfig();
	const quote = useSplitQuote();
	const place = useSplitPlace();
	const { addressChoice } = useCheckoutFlow();
	const [method, setMethod] = useState<PaymentMethod>("cod");
	const [picks, setPicks] = useState<Record<string, string>>({});
	const [accepted, setAccepted] = useState(false);
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
		setAccepted(false);
		quote.mutate(
			{
				address,
				paymentMethod: nextMethod,
				locale,
				deliveryByGroup: nextPicks,
			},
			{ onSuccess: (fresh) => setLastView(fresh) },
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
					params: { group: placed.checkoutGroup },
				});
			},
			onError: (error) => {
				if (
					error instanceof ApiError &&
					error.code === ERROR_CODES.checkoutQuoteChanged
				) {
					setIdempotencyKey(newIdempotencyKey());
					requestQuote(method, picks);
				}
			},
		});
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
	const canPlace = accepted && view.groups.length > 0 && !stale;
	const grand = formatPrice(view.grandTotal, locale);

	return (
		<FlashList<SplitQuoteGroup>
			data={view.groups}
			keyExtractor={(group) => group.groupKey}
			extraData={{ picks, stale, method }}
			contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}
			ItemSeparatorComponent={Separator}
			ListHeaderComponent={
				methodPicker ? (
					<View style={styles.headerGap}>{methodPicker}</View>
				) : null
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
								{view.unavailableGroups.map((entry) => (
									<Text
										key={entry.groupKey}
										style={[styles.meta, { color: c.warningText }]}
									>
										{t(unavailableReasonKey(entry.reason))}
									</Text>
								))}
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
						onPress={() => setAccepted(!accepted)}
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
						message={placeError ? resolveErrorMessage(placeError, t) : null}
					/>
					<CheckoutButton
						label={t("checkoutGroup.placeOrders")}
						onPress={placeOrders}
						disabled={!canPlace}
						loading={place.isPending}
					/>
				</View>
			}
		/>
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
	headerGap: { marginBottom: 16 },
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
