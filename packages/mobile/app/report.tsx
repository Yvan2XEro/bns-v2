import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
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
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
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

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const { mutate: submit, isPending } = useMutation({
		mutationFn: () =>
			api.post("/api/reports", { targetType, targetId, reason, description }),
		onSuccess: () => {
			showSuccess(t("report.successTitle"), t("report.successMessage"));
			router.dismiss();
		},
		onError: (err: any) => showError(t("report.errorTitle"), err.message),
	});

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
					<Ionicons name="flag-outline" size={20} color={textColor} />
					<Text style={[styles.title, { color: textColor }]}>
						{t("report.title")}
					</Text>
				</View>
				<Pressable onPress={() => router.dismiss()}>
					<Ionicons name="close" size={24} color={textColor} />
				</Pressable>
			</View>
			<KeyboardAwareScrollView
				contentContainerStyle={[{ padding: 20, gap: 12 }, centeredContent]}
				keyboardShouldPersistTaps="handled"
				bottomOffset={24}
			>
				<Text style={[styles.label, { color: mutedColor }]}>
					{t("report.reasonLabel")}
				</Text>
				{REASON_KEYS.map((key) => (
					<Pressable
						key={key}
						onPress={() => setReason(key)}
						style={[
							styles.reasonBtn,
							{
								backgroundColor:
									reason === key ? (isDark ? "#1e3a5f" : "#dbeafe") : cardBg,
								borderColor: reason === key ? primaryColor : borderColor,
								borderWidth: reason === key ? 2 : 1,
							},
						]}
					>
						<Text style={[styles.reasonText, { color: textColor }]}>
							{t(`report.${key}Label` as any)}
						</Text>
						{reason === key && (
							<Ionicons
								name="checkmark-circle"
								size={18}
								color={primaryColor}
							/>
						)}
					</Pressable>
				))}

				<Text style={[styles.label, { color: mutedColor, marginTop: 8 }]}>
					{t("report.descriptionLabel")}
				</Text>
				<TextInput
					value={description}
					onChangeText={setDescription}
					placeholder={t("report.descriptionPlaceholder")}
					placeholderTextColor={mutedColor}
					style={[
						styles.textarea,
						{ backgroundColor: cardBg, borderColor, color: textColor },
					]}
					multiline
					numberOfLines={4}
				/>

				<Pressable
					onPress={() => reason && submit()}
					disabled={!reason || isPending}
					style={[
						styles.submitBtn,
						{
							backgroundColor: !reason
								? isDark
									? "#1e293b"
									: "#e2e8f0"
								: "#dc2626",
						},
					]}
				>
					{isPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text
							style={[
								styles.submitText,
								{ color: !reason ? mutedColor : "#fff" },
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
		padding: 16,
		borderBottomWidth: 1,
	},
	title: { fontSize: 18, fontFamily: Fonts.displayBold },
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	reasonBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderRadius: 12,
		padding: 14,
	},
	reasonText: { fontSize: 14, fontFamily: Fonts.body },
	textarea: {
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 14,
		fontFamily: Fonts.body,
		minHeight: 100,
		textAlignVertical: "top",
	},
	submitBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
	submitText: { fontSize: 16, fontFamily: Fonts.displayBold },
});
