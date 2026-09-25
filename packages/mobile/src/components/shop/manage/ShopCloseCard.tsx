import { Ionicons } from "@expo/vector-icons";
import { Controller } from "react-hook-form";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { formStyles as f } from "@/src/components/seller/formStyles";
import { useShopTheme } from "@/src/components/shop/theme";
import { useCloseShopForm } from "@/src/hooks/useCloseShopForm";
import { useTranslation } from "@/src/lib/i18n";
import type { MyShop } from "@/src/types/api";

/**
 * Owner-only; the caller (`app/shop/manage.tsx`) only mounts this when
 * `isShopOwner(role)`, so there is no separate "not allowed" state to
 * render here — a manager never reaches this component at all.
 */
export function ShopCloseCard({ shop }: { shop: MyShop }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { form, submit, isPending } = useCloseShopForm(shop);
	const confirmation = form.watch("confirmation");
	const inputStyle = [
		f.input,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.danger }]}>
			<View style={f.row}>
				<Ionicons name="lock-closed-outline" size={18} color={c.danger} />
				<View style={{ flex: 1 }}>
					<Text style={[f.label, { color: c.danger }]}>
						{t("shop.closeTitle")}
					</Text>
					<Text style={[f.hint, { color: c.muted }]}>
						{t("shop.closeHint")}
					</Text>
				</View>
			</View>
			<Text style={[f.hint, { color: c.body }]}>
				{t("shop.closeConfirmLabel", { handle: shop.handle })}
			</Text>
			<Controller
				control={form.control}
				name="confirmation"
				render={({ field }) => (
					<TextInput
						value={field.value}
						onChangeText={field.onChange}
						onBlur={field.onBlur}
						autoCapitalize="none"
						autoCorrect={false}
						placeholder={shop.handle}
						placeholderTextColor={c.muted}
						accessibilityLabel={t("shop.closeConfirmLabel", {
							handle: shop.handle,
						})}
						style={inputStyle}
					/>
				)}
			/>
			{form.formState.errors.root?.message ? (
				<Text style={f.error}>{form.formState.errors.root.message}</Text>
			) : null}
			<Pressable
				disabled={!confirmation || !form.formState.isValid || isPending}
				onPress={submit}
				accessibilityRole="button"
				accessibilityLabel={t("shop.closeSubmit")}
				style={[
					styles.danger,
					{
						backgroundColor: c.danger,
						opacity: form.formState.isValid ? 1 : 0.5,
					},
				]}
			>
				{isPending ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.dangerText}>{t("shop.closeSubmit")}</Text>
				)}
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	danger: {
		height: 48,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	dangerText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
