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
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Fonts } from "@/constants/theme";
import { CityPicker } from "@/src/components/CityPicker";
import { useCreateShopForm } from "@/src/hooks/useCreateShopForm";
import { useCategories } from "@/src/hooks/useListings";
import { useTranslation } from "@/src/lib/i18n";
import { CategoryChips } from "../CategoryChips";
import { HandleField } from "../HandleField";
import type { PhoneStatus } from "../PhoneGate";
import { ShopAvatar } from "../ShopAvatar";
import { useShopTheme } from "../theme";
import { Field } from "./Field";

function maskPhone(phone: string | null): string {
	return (phone ?? "").replace(
		/^(\+\d{3})\s?(\d)(\d{4,})(\d{4})$/,
		(_m, cc, first, mid, last) =>
			`${cc} ${first}${"•".repeat(mid.length)} ${last}`,
	);
}

/** The form itself, reached only once ownership, the flag and the phone are all settled. */
export function ShopDetailsForm({ phone }: { phone: PhoneStatus }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const categories = useCategories();
	const {
		form,
		name,
		canSubmit,
		isPending,
		onStatus,
		onNameChange,
		onHandleChange,
		submit,
	} = useCreateShopForm();
	const maskedPhone = maskPhone(phone.phone);

	return (
		<KeyboardAwareScrollView
			contentContainerStyle={styles.scroll}
			keyboardShouldPersistTaps="handled"
		>
			<View
				style={[
					styles.preview,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<ShopAvatar name={name || "?"} size={48} />
				<View style={{ flex: 1 }}>
					<Text
						style={[styles.previewName, { color: c.text }]}
						numberOfLines={1}
					>
						{name || t("shop.namePlaceholder")}
					</Text>
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("shop.previewLabel")}
					</Text>
				</View>
			</View>

			<Field label={t("shop.nameLabel")}>
				<Controller
					control={form.control}
					name="name"
					render={({ field }) => (
						<TextInput
							value={field.value}
							onChangeText={(v) => {
								field.onChange(v);
								onNameChange(v);
							}}
							onBlur={field.onBlur}
							maxLength={60}
							placeholder={t("shop.namePlaceholder")}
							placeholderTextColor={c.muted}
							accessibilityLabel={t("shop.nameLabel")}
							style={[
								styles.input,
								{
									color: c.text,
									backgroundColor: c.input,
									borderColor: c.border,
								},
							]}
						/>
					)}
				/>
				{form.formState.errors.name ? (
					<Text style={[styles.hint, { color: c.danger }]}>
						{t("shop.nameInvalid")}
					</Text>
				) : null}
			</Field>

			<Field label={t("shop.handleLabel")}>
				<Controller
					control={form.control}
					name="handle"
					render={({ field }) => (
						<HandleField
							value={field.value}
							onChange={(v) => {
								onHandleChange();
								field.onChange(v);
							}}
							onStatus={onStatus}
						/>
					)}
				/>
				{form.formState.errors.handle ? (
					<Text style={[styles.hint, { color: c.danger }]}>
						{form.formState.errors.handle.message}
					</Text>
				) : null}
			</Field>

			<Field label={t("shop.cityLabel")}>
				<Controller
					control={form.control}
					name="city"
					render={({ field }) => (
						<CityPicker
							value={field.value?.name ?? ""}
							onSelect={field.onChange}
							onClear={() => field.onChange(null)}
							placeholder={t("shop.cityPlaceholder")}
							inputBg={c.input}
							borderColor={c.border}
							textColor={c.text}
							mutedColor={c.muted}
							primaryColor={c.primary}
						/>
					)}
				/>
			</Field>

			<Field label={t("shop.categoriesLabel")}>
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
			</Field>

			<View style={[styles.phoneRow, { backgroundColor: c.successSoft }]}>
				<Ionicons name="checkmark-circle" size={18} color={c.success} />
				<Text style={[styles.phoneText, { color: c.successText }]}>
					{t("shop.phoneVerifiedRow", { phone: maskedPhone })}
				</Text>
			</View>

			<Pressable
				onPress={submit}
				disabled={!canSubmit}
				accessibilityRole="button"
				accessibilityLabel={t("shop.createSubmit")}
				style={[
					styles.submit,
					{ backgroundColor: c.sell, opacity: canSubmit ? 1 : 0.5 },
				]}
			>
				{isPending ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.submitText}>{t("shop.createSubmit")}</Text>
				)}
			</Pressable>
			<Text style={[styles.meta, { color: c.muted, textAlign: "center" }]}>
				{t("shop.createNote")}
			</Text>
		</KeyboardAwareScrollView>
	);
}

const styles = StyleSheet.create({
	scroll: { padding: 16, gap: 16, paddingBottom: 40 },
	preview: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		padding: 14,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	previewName: { fontSize: 17, fontFamily: Fonts.displayBold },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	input: {
		height: 50,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	hint: { fontSize: 12, fontFamily: Fonts.body },
	phoneRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		padding: 12,
		borderRadius: 12,
	},
	phoneText: { flex: 1, fontSize: 13, fontFamily: Fonts.bodySemibold },
	submit: {
		height: 54,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	submitText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
