import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
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
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";

const REASON_KEYS = [
	"spam",
	"inappropriate",
	"fraud",
	"prohibited",
	"harassment",
	"other",
] as const;

export default function ReportModal() {
	const { targetType, targetId } = useLocalSearchParams<{
		targetType: string;
		targetId: string;
	}>();
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();
	const { showSuccess, showError } = useAlert();
	const [reason, setReason] = useState("");
	const [description, setDescription] = useState("");
	const { user, isLoading: authLoading } = useAuth();

	// Reports need an account. The entry points ask first; this is the
	// backstop for a deep link, and it comes back here after signing in.
	useEffect(() => {
		if (authLoading || user) return;
		const back = `/report?${new URLSearchParams({
			targetType: targetType ?? "",
			targetId: targetId ?? "",
		}).toString()}`;
		router.replace({ pathname: "/auth/login", params: { redirect: back } });
	}, [authLoading, user, targetType, targetId]);

	// "Other" says nothing by itself: it needs a few words to act on.
	const needsDetails = reason === "other";
	const detailsMissing = needsDetails && description.trim().length < 10;
	const canSubmit = !!reason && !detailsMissing;

	const c = isDark ? Colors.dark : Colors.light;
	const bg = c.background;
	const cardBg = c.card;
	const textColor = c.foreground;
	const mutedColor = c.mutedForeground;
	const primaryColor = c.primary;
	const borderColor = c.border;
	// The title names what is reported, when we know it.
	const title =
		targetType === "listing"
			? t("report.listingTitle")
			: targetType === "user"
				? t("report.userTitle")
				: targetType === "shop"
					? t("report.shopTitle")
					: t("report.title");

	const { mutate: submit, isPending } = useMutation({
		mutationFn: () =>
			api.post("/api/reports", { targetType, targetId, reason, description }),
		onSuccess: () => {
			showSuccess(t("report.successTitle"), t("report.successMessage"));
			router.dismiss();
		},
		onError: (err: any) =>
			showError(t("report.errorTitle"), resolveErrorMessage(err, t)),
	});

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Text
					style={[styles.title, { color: textColor }]}
					accessibilityRole="header"
					numberOfLines={1}
				>
					{title}
				</Text>
				<Pressable
					onPress={() => router.dismiss()}
					style={styles.closeBtn}
					accessibilityRole="button"
					accessibilityLabel={t("common.close")}
				>
					<Ionicons name="close" size={24} color={textColor} />
				</Pressable>
			</View>
			<KeyboardAwareScrollView
				contentContainerStyle={[styles.body, centeredContent]}
				keyboardShouldPersistTaps="handled"
				bottomOffset={24}
			>
				<Text
					style={[styles.label, { color: textColor }]}
					nativeID="report-reason-label"
				>
					{t("report.reasonLabel")}
				</Text>
				{/* One grouped list of radios, as a settings list reads. */}
				<View
					style={[styles.reasonList, { backgroundColor: cardBg, borderColor }]}
					accessibilityRole="radiogroup"
					accessibilityLabelledBy="report-reason-label"
				>
					{REASON_KEYS.map((key, i) => {
						const on = reason === key;
						return (
							<Pressable
								key={key}
								onPress={() => setReason(key)}
								accessibilityRole="radio"
								accessibilityState={{ checked: on }}
								style={({ pressed }) => [
									styles.reasonBtn,
									i > 0 && {
										borderTopWidth: StyleSheet.hairlineWidth,
										borderTopColor: borderColor,
									},
									{
										backgroundColor: on
											? c.primaryTint
											: pressed
												? c.well
												: "transparent",
									},
								]}
							>
								<Text
									style={[
										styles.reasonText,
										{
											color: textColor,
											fontFamily: on ? Fonts.bodySemibold : Fonts.body,
										},
									]}
								>
									{t(`report.${key}Label` as any)}
								</Text>
								<Ionicons
									name={on ? "radio-button-on" : "radio-button-off"}
									size={22}
									color={on ? primaryColor : c.faint}
								/>
							</Pressable>
						);
					})}
				</View>

				<Text style={[styles.label, styles.labelSpaced, { color: textColor }]}>
					{needsDetails ? t("report.otherHint") : t("report.descriptionLabel")}
				</Text>
				<TextInput
					value={description}
					onChangeText={setDescription}
					accessibilityLabel={
						needsDetails ? t("report.otherHint") : t("report.descriptionLabel")
					}
					placeholder={t("report.descriptionPlaceholder")}
					placeholderTextColor={c.mutedForeground}
					style={[
						styles.textarea,
						{ backgroundColor: cardBg, borderColor, color: textColor },
					]}
					multiline
					numberOfLines={4}
				/>

				<Pressable
					onPress={() => canSubmit && submit()}
					disabled={!canSubmit || isPending}
					accessibilityRole="button"
					accessibilityState={{
						disabled: !canSubmit || isPending,
						busy: isPending,
					}}
					style={({ pressed }) => [
						styles.submitBtn,
						{
							// The light destructive red in both themes: white on the
							// dark-mode red falls under 4.5:1.
							backgroundColor: !canSubmit ? c.well : Colors.light.destructive,
							opacity: pressed && canSubmit ? 0.85 : 1,
						},
					]}
				>
					{isPending ? (
						<ActivityIndicator color="#ffffff" />
					) : (
						<Text
							style={[
								styles.submitText,
								{ color: !canSubmit ? mutedColor : "#ffffff" },
							]}
						>
							{t("report.submit")}
						</Text>
					)}
				</Pressable>
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
		paddingLeft: 20,
		paddingRight: 8,
		minHeight: 60,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	title: { flex: 1, fontSize: 20, fontFamily: Fonts.displayBold },
	closeBtn: {
		width: 48,
		height: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	body: { padding: 20, gap: 10, paddingBottom: 40 },
	label: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	labelSpaced: { marginTop: 14 },
	reasonList: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	reasonBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		minHeight: 52,
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	reasonText: { flex: 1, fontSize: 15, lineHeight: 20 },
	textarea: {
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
		paddingTop: 12,
		paddingBottom: 12,
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.body,
		minHeight: 112,
		textAlignVertical: "top",
	},
	submitBtn: {
		borderRadius: 12,
		minHeight: 52,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 10,
	},
	submitText: { fontSize: 16, fontFamily: Fonts.bodyBold },
});
