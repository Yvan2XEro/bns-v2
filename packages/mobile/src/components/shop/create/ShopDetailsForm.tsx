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
import { dangerInk, successInk } from "@/src/components/shop/ink";
import { useCreateShopForm } from "@/src/hooks/useCreateShopForm";
import { useCategories } from "@/src/hooks/useListings";
import { useTranslation } from "@/src/lib/i18n";
import { CategoryChips } from "../CategoryChips";
import { HandleField } from "../HandleField";
import type { PhoneStatus } from "../PhoneGate";
import { ShopAvatar } from "../ShopAvatar";
import { ShopProfilePicker } from "../ShopProfilePicker";
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

			<Field label={t("shopProfile.pickerLabel")}>
				<Text style={[styles.hint, { color: c.muted }]}>
					{t("shopProfile.pickerHint")}
				</Text>
				<Controller
					control={form.control}
					name="profile"
					render={({ field }) => (
						<ShopProfilePicker
							value={field.value}
							onChange={field.onChange}
							disabled={isPending}
						/>
					)}
				/>
			</Field>

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
					<Text style={[styles.hint, { color: dangerInk(c) }]}>
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
					<Text style={[styles.hint, { color: dangerInk(c) }]}>
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
							value={field.value}
							onSelect={field.onChange}
							onClear={() => field.onChange(null)}
							placeholder={t("shop.cityPlaceholder")}
							inputBg={c.input}
							borderColor={c.border}
							textColor={c.text}
							mutedColor={c.muted}
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
				<Ionicons name="checkmark-circle" size={18} color={successInk(c)} />
				<Text style={[styles.phoneText, { color: c.successText }]}>
					{t("shop.phoneVerifiedRow", { phone: maskedPhone })}
				</Text>
			</View>

			<Pressable
				onPress={submit}
				disabled={!canSubmit}
				accessibilityRole="button"
				accessibilityLabel={t("shop.createSubmit")}
				accessibilityState={{ disabled: !canSubmit, busy: isPending }}
				style={[
					styles.submit,
					{ backgroundColor: c.sell, opacity: canSubmit ? 1 : 0.5 },
				]}
			>
				{isPending ? (
					<ActivityIndicator color="#12163a" />
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
	previewName: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.displayBold },
	meta: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.body },
	input: {
		height: 50,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	hint: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.body },
	phoneRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		padding: 12,
		borderRadius: 12,
	},
	phoneText: {
		flex: 1,
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodySemibold,
	},
	submit: {
		height: 54,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	submitText: {
		color: "#12163a",
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
	},
});
