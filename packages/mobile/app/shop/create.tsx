import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { CityPicker } from "@/src/components/CityPicker";
import { CategoryChips } from "@/src/components/shop/CategoryChips";
import { HandleField } from "@/src/components/shop/HandleField";
import {
	PhoneGate,
	type PhoneStatus,
	phoneStatusKey,
} from "@/src/components/shop/PhoneGate";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { useShopTheme } from "@/src/components/shop/theme";
import { useCreateShopForm } from "@/src/hooks/useCreateShopForm";
import { useCategories } from "@/src/hooks/useListings";
import { useMyShop, useShopsEnabled } from "@/src/hooks/useShops";
import { api } from "@/src/lib/api";
import { useTranslation } from "@/src/lib/i18n";

function Header({ onClose, title }: { onClose: () => void; title: string }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<View style={[styles.header, { borderBottomColor: c.border }]}>
			<Pressable
				onPress={onClose}
				accessibilityRole="button"
				accessibilityLabel={t("common.close")}
				hitSlop={12}
				style={styles.closeHit}
			>
				<Ionicons name="close" size={24} color={c.text} />
			</Pressable>
			<Text style={[styles.headerTitle, { color: c.text }]}>{title}</Text>
			<View style={{ width: 44 }} />
		</View>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	const c = useShopTheme();
	return (
		<View style={{ gap: 6 }}>
			<Text style={[styles.label, { color: c.body }]}>{label}</Text>
			{children}
		</View>
	);
}

/** Shown instead of the form when the flag is off: fails closed even on a direct deep link. */
function ShopsUnavailable({
	onClose,
	title,
}: {
	onClose: () => void;
	title: string;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
			<Header onClose={onClose} title={title} />
			<View style={styles.blocked}>
				<Ionicons name="storefront-outline" size={32} color={c.muted} />
				<Text style={[styles.blockedTitle, { color: c.text }]}>
					{t("shop.unavailableTitle")}
				</Text>
				<Text style={[styles.blockedBody, { color: c.muted }]}>
					{t("apiErrors.shop.disabled")}
				</Text>
			</View>
		</SafeAreaView>
	);
}

export default function CreateShopScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const shopsEnabled = useShopsEnabled();
	const mine = useMyShop();
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

	const phone = useQuery({
		queryKey: phoneStatusKey,
		queryFn: () => api.get<PhoneStatus>("/api/account/phone/status"),
		enabled: shopsEnabled,
	});

	useEffect(() => {
		if (mine.data?.shop) router.replace("/seller" as never);
	}, [mine.data?.shop]);

	const close = () =>
		router.canGoBack() ? router.back() : router.replace("/(tabs)/account");
	const title = t("shop.createTitle");

	if (!shopsEnabled) return <ShopsUnavailable onClose={close} title={title} />;

	if (phone.isLoading || mine.isLoading) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<Header onClose={close} title={title} />
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			</SafeAreaView>
		);
	}

	if (!phone.data?.isPhoneVerified) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<Header onClose={close} title={title} />
				<KeyboardAwareScrollView keyboardShouldPersistTaps="handled">
					<PhoneGate onVerified={() => phone.refetch()} />
				</KeyboardAwareScrollView>
			</SafeAreaView>
		);
	}

	const maskedPhone = (phone.data.phone ?? "").replace(
		/^(\+\d{3})\s?(\d)(\d{4,})(\d{4})$/,
		(_m, cc, first, mid, last) =>
			`${cc} ${first}${"•".repeat(mid.length)} ${last}`,
	);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<Header onClose={close} title={title} />
			<KeyboardAwareScrollView
				contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
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
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 16,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	closeHit: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: { fontSize: 17, fontFamily: Fonts.displayBold },
	blocked: { alignItems: "center", gap: 10, padding: 32, marginTop: 40 },
	blockedTitle: {
		fontSize: 17,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
	},
	blockedBody: {
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlign: "center",
		lineHeight: 20,
	},
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
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold },
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
