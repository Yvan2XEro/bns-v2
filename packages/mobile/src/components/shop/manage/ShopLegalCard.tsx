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
import { useUpdateShopLegalForm } from "@/src/hooks/useUpdateShopLegalForm";
import { useTranslation } from "@/src/lib/i18n";
import { businessTypeLabelKey } from "@/src/lib/shopLegal";
import type { BusinessType, MyShop } from "@/src/types/api";

const BUSINESS_TYPES: readonly BusinessType[] = [
	"entreprenant",
	"sole_trader",
	"company",
	"cooperative",
];

/**
 * The shop's own legal declaration — editable while below level 3 (business
 * verification approved), read-only at 3 since it is then reviewed content.
 * `capabilities` only ships on `MyShop` (`getMyShop`), never the public shape.
 */
export function ShopLegalCard({ shop }: { shop: MyShop }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const readOnly = shop.capabilities.effectiveLevel >= 3;
	const { form, submit, isPending } = useUpdateShopLegalForm(shop);
	const disabled = readOnly || isPending;
	const inputStyle = [
		f.input,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];

	return (
		<View style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}>
			<Text style={[f.sectionTitle, { color: c.text }]}>
				{t("shop.legalSectionTitle")}
			</Text>
			<Text style={[f.hint, { color: c.muted }]}>
				{readOnly ? t("shop.legalLockedHint") : t("shop.legalHint")}
			</Text>

			<Text style={[f.label, { color: c.body }]}>{t("shop.businessType")}</Text>
			<Controller
				control={form.control}
				name="businessType"
				render={({ field }) => (
					<View style={f.chips}>
						{BUSINESS_TYPES.map((type) => {
							const active = field.value === type;
							return (
								<Pressable
									key={type}
									disabled={disabled}
									onPress={() => field.onChange(active ? "" : type)}
									accessibilityRole="button"
									accessibilityLabel={t(businessTypeLabelKey(type))}
									style={[
										f.chip,
										{
											backgroundColor: active ? c.primary : c.input,
											borderColor: active ? c.primary : c.border,
											opacity: disabled ? 0.6 : 1,
										},
									]}
								>
									<Text
										style={[f.chipText, { color: active ? "#fff" : c.text }]}
									>
										{t(businessTypeLabelKey(type))}
									</Text>
								</Pressable>
							);
						})}
					</View>
				)}
			/>

			<Text style={[f.label, { color: c.body }]}>{t("shop.legalName")}</Text>
			<Controller
				control={form.control}
				name="legalName"
				render={({ field }) => (
					<TextInput
						value={field.value}
						editable={!disabled}
						onChangeText={field.onChange}
						onBlur={field.onBlur}
						maxLength={120}
						accessibilityLabel={t("shop.legalName")}
						style={inputStyle}
					/>
				)}
			/>

			<Text style={[f.label, { color: c.body }]}>{t("shop.rccm")}</Text>
			<Controller
				control={form.control}
				name="rccmNumber"
				render={({ field }) => (
					<TextInput
						value={field.value}
						editable={!disabled}
						onChangeText={field.onChange}
						onBlur={field.onBlur}
						maxLength={40}
						accessibilityLabel={t("shop.rccm")}
						style={inputStyle}
					/>
				)}
			/>

			<Text style={[f.label, { color: c.body }]}>{t("shop.niu")}</Text>
			<Controller
				control={form.control}
				name="niu"
				render={({ field }) => (
					<TextInput
						value={field.value}
						editable={!disabled}
						onChangeText={field.onChange}
						onBlur={field.onBlur}
						maxLength={14}
						accessibilityLabel={t("shop.niu")}
						style={inputStyle}
					/>
				)}
			/>

			{!readOnly ? (
				<Pressable
					onPress={submit}
					disabled={disabled || !form.formState.isValid}
					accessibilityRole="button"
					accessibilityLabel={t("shop.save")}
					style={[
						styles.save,
						{
							backgroundColor: c.primary,
							opacity: disabled || !form.formState.isValid ? 0.5 : 1,
						},
					]}
				>
					{isPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.saveText}>{t("shop.save")}</Text>
					)}
				</Pressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	save: {
		height: 48,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	saveText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
