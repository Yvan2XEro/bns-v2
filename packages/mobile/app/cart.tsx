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
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { CartLineRow } from "@/src/components/cart/CartLineRow";
import {
	CartCheckoutBar,
	CartSummary,
} from "@/src/components/cart/CartSummary";
import { SplitCart } from "@/src/components/cart/SplitCart";
import { useAppLocale } from "@/src/components/checkout/CheckoutProvider";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import {
	useAddCartItem,
	useCart,
	useRemoveCartItem,
	useSetCartItemQuantity,
} from "@/src/hooks/useCart";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { cartIsEmpty, isSplitCart } from "@/src/lib/checkoutGroupFlow";
import { useTranslation } from "@/src/lib/i18n";
import type { CartLineView, CartView, SplitCartGroup } from "@/src/types/order";

export default function CartScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const locale = useAppLocale();
	const { user } = useAuth();
	const { ordersEnabled, launchCities } = useAppConfig();
	const { showError } = useAlert();
	const cart = useCart();
	const setQuantity = useSetCartItemQuantity();
	const remove = useRemoveCartItem();
	const add = useAddCartItem();
	// Quantity and removal show at once (`useCart`), so one line's request no
	// longer freezes the whole cart; only a whole-group removal does.
	const [groupRemoving, setGroupRemoving] = useState(false);
	const busy = groupRemoving;
	// The last line removed, offered back for a few seconds.
	const [removed, setRemoved] = useState<CartLineView | null>(null);
	useEffect(() => {
		if (!removed) return;
		const timer = setTimeout(() => setRemoved(null), 5000);
		return () => clearTimeout(timer);
	}, [removed]);
	const removeLine = (line: CartLineView) => {
		setRemoved(line);
		remove.mutate(line.id, {
			onError: (error) => {
				setRemoved(null);
				onError(error);
			},
		});
	};
	const undoRemove = () => {
		if (!removed) return;
		add.mutate(
			{
				listingId: removed.listingId,
				variantId: removed.variantId,
				quantity: removed.quantity,
			},
			{ onError },
		);
		setRemoved(null);
	};
	const cityLabel = (key: string | null) =>
		launchCities.find((city) => city.key === key)?.label ?? null;
	const flatCart = cart.data && !isSplitCart(cart.data) ? cart.data : null;
	const lines = cart.data
		? isSplitCart(cart.data)
			? cart.data.groups.flatMap((group) => group.items)
			: cart.data.lines
		: [];
	const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
	const onError = (error: unknown) =>
		showError(t("cart.errorTitle"), resolveErrorMessage(error, t));

	// The API has no group delete; each line goes, one request at a time.
	const removeGroup = async (group: SplitCartGroup) => {
		setGroupRemoving(true);
		try {
			for (const line of group.items) await remove.mutateAsync(line.id);
		} catch (error) {
			onError(error);
		} finally {
			setGroupRemoving(false);
		}
	};

	const body = !ordersEnabled ? (
		<EmptyState illustration="notFound" title={t("cart.ordersClosed")} />
	) : !user ? (
		<EmptyState
			illustration="auth"
			title={t("cart.signInToView")}
			ctaLabel={t("auth.signIn")}
			onCta={() => router.push("/auth/login")}
		/>
	) : cart.isPending ? (
		<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
	) : cart.isError ? (
		<EmptyState
			illustration="notFound"
			title={resolveErrorMessage(cart.error, t)}
			ctaLabel={t("common.retry")}
			onCta={() => void cart.refetch()}
		/>
	) : cartIsEmpty(cart.data) ? (
		<EmptyState
			illustration="empty"
			title={t("cart.empty")}
			ctaLabel={t("cart.emptyCta")}
			onCta={() => router.replace("/(tabs)/home")}
		/>
	) : isSplitCart(cart.data) ? (
		<SplitCart
			cart={cart.data}
			locale={locale}
			busy={busy}
			onQuantity={(lineId, quantity) =>
				setQuantity.mutate({ lineId, quantity }, { onError })
			}
			onRemoveLine={(lineId) => {
				const line = lines.find((candidate) => candidate.id === lineId);
				if (line) removeLine(line);
			}}
			onRemoveGroup={(group) => void removeGroup(group)}
		/>
	) : (
		<FlashList<CartLineView>
			data={cart.data.lines}
			keyExtractor={(line) => line.id}
			contentContainerStyle={styles.list}
			ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
			ListHeaderComponent={
				cart.data.shop ? (
					<ShopRow shop={cart.data.shop} cityLabel={cityLabel} />
				) : null
			}
			renderItem={({ item }) => (
				<CartLineRow
					line={item}
					locale={locale}
					busy={busy}
					onQuantity={(quantity) =>
						setQuantity.mutate({ lineId: item.id, quantity }, { onError })
					}
					onRemove={() => removeLine(item)}
				/>
			)}
			ListFooterComponent={<CartSummary cart={cart.data} locale={locale} />}
		/>
	);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader
				title={t("cart.title")}
				subtitle={
					lines.length > 0
						? t("cart.headerSummary", { count: itemCount })
						: null
				}
			/>
			<View style={styles.body}>{body}</View>
			{removed ? (
				<View style={[styles.undoBar, { backgroundColor: c.text }]}>
					<Text style={[styles.undoText, { color: c.bg }]} numberOfLines={1}>
						{t("cart.removed", { title: removed.title })}
					</Text>
					<Pressable
						onPress={undoRemove}
						accessibilityRole="button"
						hitSlop={8}
					>
						<Text style={[styles.undoAction, { color: c.bg }]}>
							{t("cart.undo")}
						</Text>
					</Pressable>
				</View>
			) : null}
			{ordersEnabled && user && flatCart && lines.length > 0 ? (
				<CartCheckoutBar cart={flatCart} locale={locale} />
			) : null}
		</SafeAreaView>
	);
}

function ShopRow({
	shop,
	cityLabel,
}: {
	shop: NonNullable<CartView["shop"]>;
	cityLabel: (key: string | null) => string | null;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const city = cityLabel(shop.city);
	return (
		<Pressable
			onPress={() => router.push(`/s/${shop.handle}` as never)}
			accessibilityRole="link"
			accessibilityLabel={t("cart.shopHeader", { shop: shop.name })}
			style={[styles.shop, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<ShopAvatar name={shop.name} size={40} radius={12} />
			<View style={{ flex: 1 }}>
				<Text style={[styles.shopName, { color: c.text }]} numberOfLines={1}>
					{shop.name}
				</Text>
				{city ? (
					<Text style={[styles.shopMeta, { color: c.muted }]}>{city}</Text>
				) : null}
			</View>
			<Ionicons name="chevron-forward" size={16} color={c.muted} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	undoBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginHorizontal: 16,
		marginBottom: 8,
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 12,
	},
	undoText: { flex: 1, fontSize: 14 },
	undoAction: { fontSize: 14, fontWeight: "700" },
	safe: { flex: 1 },
	body: { flex: 1 },
	list: { padding: 16 },
	shop: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 12,
		borderRadius: 16,
		borderWidth: 1,
		marginBottom: 10,
	},
	shopName: { fontSize: 15, fontFamily: Fonts.displayBold },
	shopMeta: { fontSize: 12, fontFamily: Fonts.body },
});
