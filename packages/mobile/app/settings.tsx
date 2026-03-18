import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import Constants from "expo-constants";
import { router } from "expo-router";
import type React from "react";
import { useState } from "react";
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
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAlert } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";

interface SectionProps {
	title: string;
	icon: keyof typeof Ionicons.glyphMap;
	children: React.ReactNode;
	danger?: boolean;
	cardBg: string;
	borderColor: string;
	textColor: string;
	isDark: boolean;
}

function Section({
	title,
	icon,
	children,
	danger,
	cardBg,
	borderColor,
	textColor,
	isDark,
}: SectionProps) {
	return (
		<View
			style={[
				styles.section,
				{
					backgroundColor: danger ? (isDark ? "#1a0a0a" : "#fff5f5") : cardBg,
					borderColor: danger ? "#dc262640" : borderColor,
				},
			]}
		>
			<View style={styles.sectionHeader}>
				<View
					style={[
						styles.sectionIconBox,
						{
							backgroundColor: danger
								? isDark
									? "#3b1111"
									: "#fee2e2"
								: isDark
									? "#1e293b"
									: "#f1f5f9",
						},
					]}
				>
					<Ionicons
						name={icon}
						size={15}
						color={danger ? "#dc2626" : isDark ? "#94a3b8" : "#475569"}
					/>
				</View>
				<Text
					style={[
						styles.sectionTitle,
						{ color: danger ? "#dc2626" : textColor },
					]}
				>
					{title}
				</Text>
			</View>
			<View style={styles.sectionBody}>{children}</View>
		</View>
	);
}

interface FieldProps {
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
	secure?: boolean;
	icon?: keyof typeof Ionicons.glyphMap;
	mutedColor: string;
	inputBg: string;
	borderColor: string;
	textColor: string;
}

function Field({
	label,
	value,
	onChange,
	placeholder,
	secure,
	icon,
	mutedColor,
	inputBg,
	borderColor,
	textColor,
}: FieldProps) {
	return (
		<View style={styles.fieldGroup}>
			<Text style={[styles.fieldLabel, { color: mutedColor }]}>{label}</Text>
			<View
				style={[styles.inputRow, { backgroundColor: inputBg, borderColor }]}
			>
				{icon && (
					<Ionicons
						name={icon}
						size={16}
						color={mutedColor}
						style={{ marginRight: 8 }}
					/>
				)}
				<TextInput
					value={value}
					onChangeText={onChange}
					placeholder={placeholder}
					placeholderTextColor={mutedColor}
					style={[styles.input, { color: textColor }]}
					secureTextEntry={secure}
					autoCapitalize="none"
				/>
			</View>
		</View>
	);
}

export default function SettingsScreen() {
	const isDark = useColorScheme() === "dark";
	const { user, logout } = useAuth();
	const { showSuccess, showError, showConfirm } = useAlert();
	const { t } = useTranslation();
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [_currentPwd, setCurrentPwd] = useState("");
	const [newEmail, setNewEmail] = useState("");
	const [_pwdForEmail, setPwdForEmail] = useState("");

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const inputBg = isDark ? "#0b1120" : "#f8fafc";

	const { mutate: changePassword, isPending: pwdLoading } = useMutation({
		mutationFn: async () => {
			if (newPassword !== confirmPassword)
				throw new Error(t("settings.passwordMismatchError"));
			if (newPassword.length < 8)
				throw new Error(t("settings.passwordTooShortError"));
			return api.patch(`/api/users/${user?.id}`, { password: newPassword });
		},
		onSuccess: () => {
			showSuccess(
				t("settings.passwordChangedTitle"),
				t("settings.passwordChangedMessage"),
			);
			setNewPassword("");
			setConfirmPassword("");
			setCurrentPwd("");
		},
		onError: (err: any) => showError(t("settings.errorTitle"), err.message),
	});

	const { mutate: changeEmail, isPending: emailLoading } = useMutation({
		mutationFn: () => api.patch(`/api/users/${user?.id}`, { email: newEmail }),
		onSuccess: () => {
			showSuccess(
				t("settings.emailChangedTitle"),
				t("settings.emailChangedMessage"),
			);
			setNewEmail("");
			setPwdForEmail("");
		},
		onError: (err: any) => showError(t("settings.errorTitle"), err.message),
	});

	const handleDeleteAccount = () => {
		showConfirm(
			t("settings.deleteConfirmTitle"),
			t("settings.deleteConfirmMessage"),
			async () => {
				try {
					await api.delete(`/api/users/${user?.id}`);
					await logout();
					router.replace("/(tabs)/home");
				} catch (err: any) {
					showError(t("settings.errorTitle"), err.message);
				}
			},
		);
	};

	const version = Constants.expoConfig?.version ?? "1.0.0";

	const sectionColors = { cardBg, borderColor, textColor, isDark };
	const fieldColors = { mutedColor, inputBg, borderColor, textColor };

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			{/* Header */}
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: textColor }]}>
					{t("settings.title")}
				</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView
				contentContainerStyle={[styles.scroll, { backgroundColor: bg }]}
				showsVerticalScrollIndicator={false}
			>
				{/* Mot de passe */}
				<Section
					title={t("settings.passwordSection")}
					icon="lock-closed-outline"
					{...sectionColors}
				>
					<Field
						label={t("settings.newPasswordLabel")}
						value={newPassword}
						onChange={setNewPassword}
						placeholder={t("settings.newPasswordPlaceholder")}
						secure
						icon="lock-closed-outline"
						{...fieldColors}
					/>
					<Field
						label={t("settings.confirmPasswordLabel")}
						value={confirmPassword}
						onChange={setConfirmPassword}
						placeholder={t("settings.confirmPasswordPlaceholder")}
						secure
						icon="lock-closed-outline"
						{...fieldColors}
					/>
					<Pressable
						onPress={() => changePassword()}
						disabled={pwdLoading}
						style={[
							styles.btn,
							{ backgroundColor: primaryColor, opacity: pwdLoading ? 0.7 : 1 },
						]}
					>
						{pwdLoading ? (
							<ActivityIndicator color="#fff" />
						) : (
							<Text style={styles.btnText}>
								{t("settings.changePasswordBtn")}
							</Text>
						)}
					</Pressable>
				</Section>

				{/* Email */}
				<Section
					title={t("settings.emailSection")}
					icon="mail-outline"
					{...sectionColors}
				>
					{user?.email && (
						<View style={[styles.currentRow, { borderColor }]}>
							<Text style={[styles.currentLabel, { color: mutedColor }]}>
								{t("settings.currentLabel")}
							</Text>
							<Text style={[styles.currentValue, { color: textColor }]}>
								{user.email}
							</Text>
						</View>
					)}
					<Field
						label={t("settings.newEmailLabel")}
						value={newEmail}
						onChange={setNewEmail}
						placeholder={t("settings.newEmailPlaceholder")}
						icon="mail-outline"
						{...fieldColors}
					/>
					<Pressable
						onPress={() => changeEmail()}
						disabled={emailLoading}
						style={[
							styles.btn,
							{
								backgroundColor: primaryColor,
								opacity: emailLoading ? 0.7 : 1,
							},
						]}
					>
						{emailLoading ? (
							<ActivityIndicator color="#fff" />
						) : (
							<Text style={styles.btnText}>{t("settings.changeEmailBtn")}</Text>
						)}
					</Pressable>
				</Section>

				{/* Informations */}
				<Section
					title={t("settings.aboutSection")}
					icon="information-circle-outline"
					{...sectionColors}
				>
					<View style={[styles.infoRow, { borderColor }]}>
						<Text style={[styles.infoLabel, { color: mutedColor }]}>
							{t("settings.appVersion")}
						</Text>
						<View
							style={[
								styles.versionBadge,
								{ backgroundColor: isDark ? "#1e293b" : "#f1f5f9" },
							]}
						>
							<Text style={[styles.versionText, { color: primaryColor }]}>
								v{version}
							</Text>
						</View>
					</View>
				</Section>

				{/* Zone dangereuse */}
				<Section
					title={t("settings.dangerZone")}
					icon="warning-outline"
					danger
					{...sectionColors}
				>
					<Text style={[styles.dangerDesc, { color: mutedColor }]}>
						{t("settings.dangerDesc")}
					</Text>
					<Pressable onPress={handleDeleteAccount} style={styles.deleteBtn}>
						<Ionicons name="trash-outline" size={16} color="#dc2626" />
						<Text style={styles.deleteText}>
							{t("settings.deleteMyAccount")}
						</Text>
					</Pressable>
				</Section>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	backBtn: {
		width: 40,
		height: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: {
		flex: 1,
		fontSize: 20,
		fontFamily: Fonts.displayBold,
		textAlign: "center",
	},
	scroll: { padding: 16, gap: 12, paddingBottom: 48 },

	/* Section */
	section: {
		borderRadius: 16,
		borderWidth: 1,
		overflow: "hidden",
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 16,
		paddingTop: 14,
		paddingBottom: 12,
	},
	sectionIconBox: {
		width: 30,
		height: 30,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	sectionTitle: {
		fontSize: 15,
		fontFamily: Fonts.displayBold,
	},
	sectionBody: {
		paddingHorizontal: 16,
		paddingBottom: 16,
		gap: 12,
	},

	/* Field */
	fieldGroup: { gap: 6 },
	fieldLabel: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},
	inputRow: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 11,
	},
	input: {
		flex: 1,
		fontSize: 15,
		fontFamily: Fonts.body,
	},

	/* Button */
	btn: {
		borderRadius: 10,
		paddingVertical: 13,
		alignItems: "center",
		marginTop: 4,
	},
	btnText: {
		color: "#fff",
		fontSize: 15,
		fontFamily: Fonts.displayBold,
	},

	/* Current value row */
	currentRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	currentLabel: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
	},
	currentValue: {
		fontSize: 13,
		fontFamily: Fonts.body,
	},

	/* Info row */
	infoRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 12,
		paddingVertical: 11,
	},
	infoLabel: {
		fontSize: 14,
		fontFamily: Fonts.body,
	},
	versionBadge: {
		borderRadius: 8,
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	versionText: {
		fontSize: 13,
		fontFamily: Fonts.displayBold,
	},

	/* Danger zone */
	dangerDesc: {
		fontSize: 13,
		fontFamily: Fonts.body,
		lineHeight: 20,
	},
	deleteBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderWidth: 1.5,
		borderColor: "#dc262650",
		borderRadius: 10,
		paddingHorizontal: 14,
		paddingVertical: 11,
	},
	deleteText: {
		color: "#dc2626",
		fontSize: 14,
		fontFamily: Fonts.displayBold,
	},
});
