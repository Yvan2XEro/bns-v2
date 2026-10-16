import { Controller } from "react-hook-form";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { CityPicker } from "@/src/components/CityPicker";
import { formStyles as f } from "@/src/components/seller/formStyles";
import { CategoryChips } from "@/src/components/shop/CategoryChips";
import { useShopTheme } from "@/src/components/shop/theme";
import { useCategories } from "@/src/hooks/useListings";
import { useUpdateShopForm } from "@/src/hooks/useUpdateShopForm";
import { useTranslation } from "@/src/lib/i18n";
import { phoneExample } from "@/src/lib/market";
import type { MyShop } from "@/src/types/api";

export type ProfileSection =
	| "name"
	| "description"
	| "city"
	| "categories"
	| "contacts";

/**
 * One profile field (or the contacts group) on its own settings screen. The
 * whole profile still saves through the same single `PATCH`, the other fields
 * carrying their current values.
 */
export function ShopProfileCard({
	shop,
	readOnly,
	section,
	onSaved,
}: {
	shop: MyShop;
	readOnly: boolean;
	section: ProfileSection;
	onSaved?: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const categories = useCategories();
	const {
		form,
		description,
		categories: picked,
		submit,
		isPending,
	} = useUpdateShopForm(shop, { onSaved });
	const inputStyle = [
		f.input,
		{ color: c.text, backgroundColor: c.input, borderColor: c.border },
	];
	const disabled = readOnly || isPending;

	return (
		<>
			<View
				style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				{section === "name" ? (
					<>
						<Text style={[f.label, { color: c.body }]}>
							{t("shop.nameLabel")}
						</Text>
						<Controller
							control={form.control}
							name="name"
							render={({ field }) => (
								<TextInput
									value={field.value}
									editable={!disabled}
									onChangeText={field.onChange}
									onBlur={field.onBlur}
									maxLength={60}
									accessibilityLabel={t("shop.nameLabel")}
									style={inputStyle}
								/>
							)}
						/>
						{form.formState.errors.name ? (
							<Text style={f.error}>{t("shop.nameInvalid")}</Text>
						) : null}
					</>
				) : null}
				{section === "description" ? (
					<>
						<View style={f.labelRow}>
							<Text style={[f.label, { color: c.body }]}>
								{t("shop.descriptionLabel")}
							</Text>
							<Text style={[f.counter, { color: c.muted }]}>
								{description.length} / 1 000
							</Text>
						</View>
						<Controller
							control={form.control}
							name="description"
							render={({ field }) => (
								<TextInput
									value={field.value}
									editable={!disabled}
									onChangeText={field.onChange}
									onBlur={field.onBlur}
									maxLength={1000}
									multiline
									accessibilityLabel={t("shop.descriptionLabel")}
									style={[...inputStyle, f.multiline]}
								/>
							)}
						/>
					</>
				) : null}
				{section === "city" ? (
					<>
						<Text style={[f.label, { color: c.body }]}>
							{t("shop.cityLabel")}
						</Text>
						<Controller
							control={form.control}
							name="city"
							render={({ field }) => (
								<CityPicker
									value={field.value}
									onSelect={field.onChange}
									onClear={() => field.onChange(null)}
									inputBg={c.input}
									borderColor={c.border}
									textColor={c.text}
									mutedColor={c.muted}
								/>
							)}
						/>
					</>
				) : null}
				{section === "categories" ? (
					<>
						<Text style={[f.label, { color: c.body }]}>
							{t("shop.categoriesLabel")} · {picked.length}/5
						</Text>
						<Controller
							control={form.control}
							name="categories"
							render={({ field }) => (
								<CategoryChips
									categories={categories.data?.categories ?? []}
									value={field.value}
									onChange={field.onChange}
								/>
							)}
						/>
					</>
				) : null}
				{section === "contacts" ? (
					<>
						<Text style={[f.label, { color: c.body }]}>
							{t("shop.contactPhone")}
						</Text>
						<Controller
							control={form.control}
							name="phone"
							render={({ field }) => (
								<TextInput
									value={field.value}
									editable={!disabled}
									onChangeText={field.onChange}
									onBlur={field.onBlur}
									keyboardType="phone-pad"
									placeholder={phoneExample()}
									placeholderTextColor={c.muted}
									accessibilityLabel={t("shop.contactPhone")}
									style={inputStyle}
								/>
							)}
						/>
						<Text style={[f.label, { color: c.body }]}>
							{t("shop.contactWhatsapp")}
						</Text>
						<Controller
							control={form.control}
							name="whatsapp"
							render={({ field }) => (
								<TextInput
									value={field.value}
									editable={!disabled}
									onChangeText={field.onChange}
									onBlur={field.onBlur}
									keyboardType="phone-pad"
									placeholder={phoneExample()}
									placeholderTextColor={c.muted}
									accessibilityLabel={t("shop.contactWhatsapp")}
									style={inputStyle}
								/>
							)}
						/>
						<Text style={[f.label, { color: c.body }]}>
							{t("shop.contactEmail")}
						</Text>
						<Controller
							control={form.control}
							name="email"
							render={({ field }) => (
								<TextInput
									value={field.value}
									editable={!disabled}
									onChangeText={field.onChange}
									onBlur={field.onBlur}
									keyboardType="email-address"
									autoCapitalize="none"
									accessibilityLabel={t("shop.contactEmail")}
									style={inputStyle}
								/>
							)}
						/>
						{form.formState.errors.email ? (
							<Text style={f.error}>{t("shop.contactEmailInvalid")}</Text>
						) : (
							<Text style={[f.hint, { color: c.muted }]}>
								{t("shop.contactsHint")}
							</Text>
						)}
					</>
				) : null}
			</View>

			<Pressable
				onPress={submit}
				disabled={disabled || !form.formState.isValid}
				accessibilityRole="button"
				accessibilityLabel={t("shop.save")}
				style={[
					f.card,
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
		</>
	);
}

const styles = StyleSheet.create({
	save: { height: 52, alignItems: "center", justifyContent: "center" },
	saveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
