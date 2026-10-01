import { router } from "expo-router";
import { Controller, type FieldError } from "react-hook-form";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useInviteMemberForm } from "@/src/hooks/useInviteMemberForm";
import { useMyShop } from "@/src/hooks/useShops";
import { useTranslation } from "@/src/lib/i18n";

const ROLE_KEY: Record<"manager" | "staff", string> = {
	manager: "team.roleManager",
	staff: "team.roleStaff",
};

/**
 * `inviteSchema`'s own issues carry "required" or "invalid" as their
 * message — a key to translate here. A server refusal (`setError(..., {
 * type: "server" })`) already carries the fully resolved, user-facing
 * sentence, so it is shown exactly as given rather than remapped.
 */
function fieldMessage(
	error: FieldError,
	t: (key: string) => string,
	keys: { required: string; invalid: string },
): string {
	if (error.type === "server") return error.message ?? "";
	return t(error.message === "required" ? keys.required : keys.invalid);
}

export default function InviteMemberScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const myShop = useMyShop();
	const shop = myShop.data?.shop;
	const role = myShop.data?.role ?? null;
	const { form, channel, roles, delivered, isPending, submit } =
		useInviteMemberForm(shop?.id ?? "", role, () => router.back());

	const close = () => router.back();

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("team.inviteTitle")} icon="close" onBack={close} />

			<ScrollView
				contentContainerStyle={styles.content}
				keyboardShouldPersistTaps="handled"
			>
				{delivered === false ? (
					<View style={[styles.notice, { backgroundColor: c.warningSoft }]}>
						<Text style={[styles.noticeText, { color: c.warningText }]}>
							{t("team.deliveredFalse")}
						</Text>
						<Pressable
							onPress={close}
							accessibilityRole="button"
							accessibilityLabel={t("common.close")}
							style={[styles.submit, { backgroundColor: c.primary }]}
						>
							<Text style={styles.submitText}>{t("common.close")}</Text>
						</Pressable>
					</View>
				) : (
					<>
						<View style={[styles.segment, { backgroundColor: c.neutralSoft }]}>
							{(["phone", "email"] as const).map((option) => {
								const active = channel === option;
								return (
									<Pressable
										key={option}
										onPress={() =>
											form.setValue("channel", option, {
												shouldValidate: true,
											})
										}
										accessibilityRole="button"
										accessibilityState={{ selected: active }}
										accessibilityLabel={t(
											option === "phone"
												? "team.channelPhone"
												: "team.channelEmail",
										)}
										style={[
											styles.segmentItem,
											active && { backgroundColor: c.card },
										]}
									>
										<Text
											style={[
												styles.segmentText,
												{ color: active ? c.text : c.muted },
											]}
										>
											{t(
												option === "phone"
													? "team.channelPhone"
													: "team.channelEmail",
											)}
										</Text>
									</Pressable>
								);
							})}
						</View>

						{channel === "phone" ? (
							<View>
								<Text style={[styles.label, { color: c.body }]}>
									{t("team.phoneLabel")}
								</Text>
								<Controller
									control={form.control}
									name="phone"
									render={({ field }) => (
										<TextInput
											value={field.value}
											onChangeText={field.onChange}
											onBlur={field.onBlur}
											keyboardType="phone-pad"
											placeholder="+237600000000"
											placeholderTextColor={c.muted}
											accessibilityLabel={t("team.phoneLabel")}
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
								{form.formState.errors.phone ? (
									<Text style={[styles.hint, { color: c.danger }]}>
										{fieldMessage(form.formState.errors.phone, t, {
											required: "team.phoneRequired",
											invalid: "team.phoneInvalid",
										})}
									</Text>
								) : null}
							</View>
						) : (
							<View>
								<Text style={[styles.label, { color: c.body }]}>
									{t("team.emailLabel")}
								</Text>
								<Controller
									control={form.control}
									name="email"
									render={({ field }) => (
										<TextInput
											value={field.value}
											onChangeText={field.onChange}
											onBlur={field.onBlur}
											keyboardType="email-address"
											autoCapitalize="none"
											placeholder="name@example.com"
											placeholderTextColor={c.muted}
											accessibilityLabel={t("team.emailLabel")}
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
								{form.formState.errors.email ? (
									<Text style={[styles.hint, { color: c.danger }]}>
										{fieldMessage(form.formState.errors.email, t, {
											required: "team.emailRequired",
											invalid: "team.emailInvalid",
										})}
									</Text>
								) : null}
							</View>
						)}

						<View>
							<Text style={[styles.label, { color: c.body }]}>
								{t("team.roleLabel")}
							</Text>
							<View style={styles.roleRow}>
								{roles.map((option) => {
									const active = form.watch("role") === option;
									return (
										<Pressable
											key={option}
											onPress={() =>
												form.setValue("role", option, { shouldValidate: true })
											}
											accessibilityRole="button"
											accessibilityState={{ selected: active }}
											accessibilityLabel={t(ROLE_KEY[option])}
											style={[
												styles.roleChip,
												{
													borderColor: active ? c.primary : c.border,
													backgroundColor: active ? c.primarySoft : c.card,
												},
											]}
										>
											<Text
												style={[
													styles.roleChipText,
													{ color: active ? c.primary : c.body },
												]}
											>
												{t(ROLE_KEY[option])}
											</Text>
										</Pressable>
									);
								})}
							</View>
						</View>

						<Pressable
							onPress={submit}
							disabled={!form.formState.isValid || isPending}
							accessibilityRole="button"
							accessibilityLabel={t("team.send")}
							style={[
								styles.submit,
								{
									backgroundColor: c.primary,
									opacity: !form.formState.isValid || isPending ? 0.5 : 1,
								},
							]}
						>
							{isPending ? (
								<ActivityIndicator color="#fff" />
							) : (
								<Text style={styles.submitText}>{t("team.send")}</Text>
							)}
						</Pressable>
					</>
				)}
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	content: { padding: 16, gap: 16, paddingBottom: 40 },
	segment: {
		flexDirection: "row",
		borderRadius: 12,
		padding: 4,
		gap: 4,
	},
	segmentItem: {
		flex: 1,
		minHeight: 40,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	segmentText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold, marginBottom: 6 },
	input: {
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	hint: { fontSize: 12, fontFamily: Fonts.body, marginTop: 4 },
	roleRow: { flexDirection: "row", gap: 8 },
	roleChip: {
		minHeight: 40,
		paddingHorizontal: 16,
		borderRadius: 999,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	roleChipText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	submit: {
		minHeight: 48,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	submitText: { color: "#fff", fontSize: 15, fontFamily: Fonts.bodySemibold },
	notice: { borderRadius: 14, padding: 16, gap: 12 },
	noticeText: { fontSize: 14, fontFamily: Fonts.body },
});
