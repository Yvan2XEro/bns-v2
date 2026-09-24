import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { formStyles as f } from "@/src/components/seller/formStyles";
import { HandleField } from "@/src/components/shop/HandleField";
import { useShopTheme } from "@/src/components/shop/theme";
import { useChangeHandleForm } from "@/src/hooks/useChangeHandleForm";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { isShopOwner } from "@/src/lib/variants";
import type { MyShop, ShopRole } from "@/src/types/api";

/**
 * A manager sees the current address as read-only text: `useChangeHandle`
 * is owner-only on the server, so the edit control (not just its submit)
 * must never render for anyone else.
 */
export function ShopAddressCard({
	shop,
	role,
	readOnly,
}: {
	shop: MyShop;
	role: ShopRole | null;
	readOnly: boolean;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const locale = i18n.language?.startsWith("en") ? "en-GB" : "fr-FR";
	const owner = isShopOwner(role);

	const cooldownUntil =
		shop.nextHandleChangeAt && new Date(shop.nextHandleChangeAt) > new Date()
			? shop.nextHandleChangeAt
			: null;

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<Text style={[f.sectionTitle, { color: c.text }]}>
				{t("shop.addressTitle")}
			</Text>
			{!owner ? (
				<>
					<Text style={[f.label, { color: c.text }]}>
						buynsellem.com/s/{shop.handle}
					</Text>
					<Text style={[f.hint, { color: c.muted }]}>
						{t("shop.addressOwnerOnly")}
					</Text>
				</>
			) : cooldownUntil ? (
				<>
					<Text style={[f.label, { color: c.text }]}>
						buynsellem.com/s/{shop.handle}
					</Text>
					<Text style={[f.hint, { color: c.muted }]}>
						{t("shop.nextHandleChange", {
							date: formatDate(
								cooldownUntil,
								{ day: "numeric", month: "long" },
								locale,
							),
						})}
					</Text>
				</>
			) : (
				<OwnerHandleForm shop={shop} readOnly={readOnly} />
			)}
		</View>
	);
}

function OwnerHandleForm({
	shop,
	readOnly,
}: {
	shop: MyShop;
	readOnly: boolean;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { form, handle, onStatus, canSubmit, isPending, submit } =
		useChangeHandleForm(shop);

	return (
		<>
			<HandleField
				value={handle}
				onChange={(v) => form.setValue("handle", v, { shouldValidate: true })}
				onStatus={onStatus}
				current={shop.handle}
			/>
			<Text style={[f.hint, { color: c.muted }]}>
				{t("shop.handleChangeHint")}
			</Text>
			{form.formState.errors.root?.message ? (
				<Text style={f.error}>{form.formState.errors.root.message}</Text>
			) : null}
			{handle !== shop.handle ? (
				<Pressable
					disabled={!canSubmit || readOnly}
					onPress={submit}
					accessibilityRole="button"
					accessibilityLabel={t("shop.changeHandle")}
					style={[
						styles.outline,
						{ borderColor: c.primary, opacity: canSubmit ? 1 : 0.5 },
					]}
				>
					{isPending ? (
						<ActivityIndicator color={c.primary} />
					) : (
						<Text style={[f.label, { color: c.primary }]}>
							{t("shop.changeHandle")}
						</Text>
					)}
				</Pressable>
			) : null}
		</>
	);
}

const styles = StyleSheet.create({
	outline: {
		height: 44,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
});
