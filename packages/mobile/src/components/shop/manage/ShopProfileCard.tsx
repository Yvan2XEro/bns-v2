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
import type { MyShop } from "@/src/types/api";

/** Name, description, city, categories and the three contact fields — one `PATCH`, one Save. */
export function ShopProfileCard({
	shop,
	readOnly,
}: {
	shop: MyShop;
	readOnly: boolean;
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
	} = useUpdateShopForm(shop);
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
				<Text style={[f.sectionTitle, { color: c.text }]}>
					{t("shop.profileTitle")}
				</Text>
				<Text style={[f.label, { color: c.body }]}>{t("shop.nameLabel")}</Text>
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
				<Text style={[f.label, { color: c.body }]}>{t("shop.cityLabel")}</Text>
				<Controller
					control={form.control}
					name="city"
					render={({ field }) => (
						<CityPicker
							value={field.value?.name ?? ""}
							onSelect={field.onChange}
							onClear={() => field.onChange(null)}
							inputBg={c.input}
							borderColor={c.border}
							textColor={c.text}
							mutedColor={c.muted}
							primaryColor={c.primary}
						/>
					)}
				/>
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
			</View>

			<View
				style={[f.card, { backgroundColor: c.card, borderColor: c.border }]}
			>
				<Text style={[f.sectionTitle, { color: c.text }]}>
					{t("shop.contactsTitle")}
				</Text>
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
							placeholder="+237 6XX XXX XXX"
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
							placeholder="+237 6XX XXX XXX"
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
