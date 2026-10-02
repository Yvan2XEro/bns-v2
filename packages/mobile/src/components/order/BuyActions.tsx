import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useReducer } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { type AddCartItemInput, useAddCartItem } from "@/src/hooks/useCart";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { getAuthModalParams } from "@/src/lib/authRedirect";
import { singleShopConflict } from "@/src/lib/buyBox";
import { useTranslation } from "@/src/lib/i18n";
import { isVariantInStock } from "@/src/lib/variantPicker";
import type { PublicVariantDoc } from "@/src/types/api";

type State = { quantity: number; added: boolean };

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

export function BuyActions({
	listingId,
	shopId,
	variant,
	signedIn,
}: {
	listingId: string;
	shopId: string | null;
	variant: PublicVariantDoc | null;
	signedIn: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const pathname = usePathname();
	const { withdrawalDays } = useAppConfig();
	const { showAlert, showError } = useAlert();
	const add = useAddCartItem();
	const [state, patch] = useReducer(reducer, { quantity: 1, added: false });
	const buyable = variant !== null && isVariantInStock(variant);
	const disabled = !buyable || add.isPending;

	function send(request: AddCartItemInput, checkout: boolean) {
		patch({ added: false });
		add.mutate(request, {
			onSuccess: () => {
				if (checkout) router.push("/checkout/address");
				else patch({ added: true });
			},
			onError: (error) => {
				// The listing's shop is known here, so the dialog can name the
				// shop whose items are in the way.
				const conflict = singleShopConflict(error, shopId);
				if (!conflict) {
					showError(t("cart.errorTitle"), resolveErrorMessage(error, t));
					return;
				}
				const name = conflict.currentShop?.name;
				showAlert(
					t("cart.singleShopTitle"),
					name
						? t("buyBox.singleShopBodyNamed", { shop: name })
						: t("cart.singleShopBody"),
					[
						{ text: t("cart.singleShopKeep"), style: "cancel" },
						{
							text: t("cart.singleShopReplace"),
							onPress: () => send({ ...request, replace: true }, checkout),
						},
					],
					"confirm",
				);
			},
		});
	}

	function submit(checkout: boolean) {
		if (!variant || !buyable) return;
		if (!signedIn) {
			router.push({
				pathname: "/auth/login",
				params: getAuthModalParams(pathname),
			});
			return;
		}
		send(
			{ listingId, variantId: variant.id, quantity: state.quantity },
			checkout,
		);
	}

	return (
		<View style={[styles.wrap, { borderColor: c.border }]}>
			<View style={styles.row}>
				<Text style={[styles.label, { color: c.muted }]}>
					{t("buyBox.quantity")}
				</Text>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("buyBox.decrease")}
					disabled={state.quantity <= 1}
					onPress={() => patch({ quantity: state.quantity - 1 })}
					style={[styles.step, { borderColor: c.border }]}
				>
					<Ionicons name="remove" size={18} color={c.text} />
				</Pressable>
				<Text
					accessibilityLiveRegion="polite"
					style={[styles.quantity, { color: c.text }]}
				>
					{state.quantity}
				</Text>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("buyBox.increase")}
					onPress={() => patch({ quantity: state.quantity + 1 })}
					style={[styles.step, { borderColor: c.border }]}
				>
					<Ionicons name="add" size={18} color={c.text} />
				</Pressable>
			</View>

			{!buyable ? (
				<Text style={[styles.small, { color: c.dangerText }]}>
					{t("buyBox.chooseVariant")}
				</Text>
			) : null}

			<View style={styles.row}>
				<Pressable
					accessibilityRole="button"
					accessibilityState={{ disabled }}
					disabled={disabled}
					onPress={() => submit(false)}
					style={[
						styles.button,
						{ borderColor: c.primary, opacity: disabled ? 0.5 : 1 },
					]}
				>
					<Text style={[styles.buttonText, { color: c.primary }]}>
						{t("buyBox.addToCart")}
					</Text>
				</Pressable>
				<Pressable
					accessibilityRole="button"
					accessibilityState={{ disabled }}
					disabled={disabled}
					onPress={() => submit(true)}
					style={[
						styles.button,
						{
							backgroundColor: c.primary,
							borderColor: c.primary,
							opacity: disabled ? 0.5 : 1,
						},
					]}
				>
					<Text style={[styles.buttonText, { color: "#ffffff" }]}>
						{t("buyBox.buyNow")}
					</Text>
				</Pressable>
			</View>

			{state.added ? (
				<Pressable
					accessibilityRole="link"
					onPress={() => router.push("/cart")}
					style={styles.added}
				>
					<Text style={[styles.small, { color: c.successText }]}>
						{t("buyBox.added")}{" "}
						<Text style={{ color: c.primary, fontFamily: Fonts.bodySemibold }}>
							{t("buyBox.viewCart")}
						</Text>
					</Text>
				</Pressable>
			) : null}

			<View style={styles.badges}>
				<Text
					style={[
						styles.badge,
						{ backgroundColor: c.successSoft, color: c.successText },
					]}
				>
					{t("buyBox.codBadge")}
				</Text>
				<Text
					style={[
						styles.badge,
						{ backgroundColor: c.primarySoft, color: c.primary },
					]}
				>
					{t("buyBox.returnBadge", { days: withdrawalDays })}
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 12 },
	row: { flexDirection: "row", alignItems: "center", gap: 10 },
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold, flex: 1 },
	step: {
		width: 44,
		height: 44,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	quantity: {
		minWidth: 28,
		textAlign: "center",
		fontSize: 16,
		fontFamily: Fonts.bodySemibold,
	},
	button: {
		flex: 1,
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 12,
	},
	buttonText: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	added: { minHeight: 44, justifyContent: "center" },
	small: { fontSize: 13, fontFamily: Fonts.body },
	badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	badge: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
		overflow: "hidden",
	},
});
