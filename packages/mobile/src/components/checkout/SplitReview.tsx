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
import { Fonts } from "@/constants/theme";
import { formStyles } from "@/src/components/seller/formStyles";
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
import { useAppLocale } from "./CheckoutProvider";
import { DeliveryOptionCard } from "./DeliveryOptionCard";
import { PaymentMethodPicker } from "./PaymentMethodPicker";

/**
 * The review of a multi-shop cart: one quote, one card per group with its own
 * delivery pick, one address for all, one acceptance. Every figure is the
 * server's; the buyer picks, the server prices.
 */
export function SplitReview({ address }: { address: AddressInput }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useAppLocale();
	const { protectedPaymentEnabled, buyerProtection } = useAppConfig();
	const quote = useSplitQuote();
	const place = useSplitPlace();
	const [method, setMethod] = useState<PaymentMethod>("cod");
	const [picks, setPicks] = useState<Record<string, string>>({});
	const [accepted, setAccepted] = useState(false);
	const [idempotencyKey, setIdempotencyKey] = useState(() =>
		newIdempotencyKey(),
	);
	const view: SplitQuoteView | undefined = quote.data;

	const requestQuote = (
		nextMethod: PaymentMethod,
		nextPicks: Record<string, string>,
	) => {
		setAccepted(false);
		quote.mutate({
			address,
			paymentMethod: nextMethod,
			locale,
			deliveryByGroup: nextPicks,
		});
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
		if (!view) return;
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
		place.mutate(body, {
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

	if (!view) {
		return (
			<View style={{ padding: 16, gap: 16 }}>
				{methodPicker}
				{quote.isError ? (
					<>
						<Text style={formStyles.error} accessibilityRole="alert">
							{resolveErrorMessage(quote.error, t)}
						</Text>
						<CheckoutButton
							label={t("checkout.retryQuote")}
							onPress={() => requestQuote(method, picks)}
						/>
					</>
				) : (
					<ActivityIndicator color={c.primary} />
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
	const canPlace = accepted && view.groups.length > 0 && !quote.isPending;

	return (
		<FlashList<SplitQuoteGroup>
			data={view.groups}
			keyExtractor={(group) => group.groupKey}
			contentContainerStyle={{ padding: 16 }}
			ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
			ListHeaderComponent={
				<View style={{ marginBottom: 16 }}>{methodPicker}</View>
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
						<Text style={[styles.title, { color: c.text }]}>
							{t("checkoutGroup.deliveryFor", {
								shop: group.storefrontShop.name,
							})}
						</Text>
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
						<AmountRow
							label={t("checkoutGroup.groupSubtotal")}
							value={formatPrice(group.subtotal, locale)}
						/>
						<AmountRow
							label={t("checkoutGroup.groupDelivery")}
							value={formatPrice(group.deliveryFee, locale)}
						/>
						<AmountRow
							label={t("checkoutGroup.groupTotal")}
							value={formatPrice(group.total, locale)}
							strong
						/>
					</View>
				);
			}}
			ListFooterComponent={
				<View style={{ gap: 12, marginTop: 16 }}>
					{view.unavailableGroups.length > 0 ? (
						<View style={{ gap: 4 }}>
							<Text style={[styles.title, { color: c.dangerText }]}>
								{t("checkoutGroup.unavailableTitle")}
							</Text>
							{view.unavailableGroups.map((entry) => (
								<Text
									key={entry.groupKey}
									style={[styles.meta, { color: c.dangerText }]}
								>
									{t(unavailableReasonKey(entry.reason))}
								</Text>
							))}
						</View>
					) : null}
					<AmountRow
						label={t("checkoutGroup.grandTotal")}
						value={formatPrice(view.grandTotal, locale)}
						strong
					/>
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
						<Text style={[styles.meta, { flex: 1, color: c.text }]}>
							{t("checkout.acceptTerms")}
						</Text>
					</Pressable>
					{placeError ? (
						<Text style={formStyles.error} accessibilityRole="alert">
							{resolveErrorMessage(placeError, t)}
						</Text>
					) : null}
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
			<Text style={[styles.meta, { color: c.muted }]}>{label}</Text>
			<Text style={[strong ? styles.title : styles.meta, { color: c.text }]}>
				{value}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		padding: 16,
		gap: 10,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	title: { fontSize: 16, fontFamily: Fonts.displayBold },
	meta: { fontSize: 13, fontFamily: Fonts.body },
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	accept: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 44,
	},
});
