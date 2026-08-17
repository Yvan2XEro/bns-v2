import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { router } from "expo-router";
import type React from "react";
import { useEffect, useState } from "react";
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
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import i18n, { useTranslation } from "@/src/lib/i18n";

function getErrorMessage(error: unknown, fallback: string): string {
	// `error instanceof Error` was always true for a failed request, so the
	// fallback never fired and users saw raw API text. resolveErrorMessage maps
	// the error code to translated copy and keeps the fallback for the rest.
	return resolveErrorMessage(error, (key) => i18n.t(key), fallback);
}

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

interface PhoneVerificationStatus {
	expiresAt: null | string;
	hasPendingVerification: boolean;
	isPhoneVerified: boolean;
	pendingPhone: null | string;
	phone: null | string;
	phoneVerifiedAt: null | string;
	resendAvailableAt: null | string;
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

export default function SecurityScreen() {
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { user, logout, refreshUser } = useAuth();
	const { showSuccess, showError, showConfirm } = useAlert();
	const { t } = useTranslation();
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [phoneInput, setPhoneInput] = useState("");
	const [otpCode, setOtpCode] = useState("");

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const inputBg = isDark ? "#0b1120" : "#f8fafc";

	const { mutate: changePassword, isPending: pwdLoading } = useMutation({
		mutationFn: async () => {
			if (newPassword !== confirmPassword) {
				throw new Error(t("settings.passwordMismatchError"));
			}

			if (newPassword.length < 8) {
				throw new Error(t("settings.passwordTooShortError"));
			}

			return api.patch(`/api/users/${user?.id}`, { password: newPassword });
		},
		onSuccess: () => {
			showSuccess(
				t("settings.passwordChangedTitle"),
				t("settings.passwordChangedMessage"),
			);
			setNewPassword("");
			setConfirmPassword("");
		},
		onError: (err: unknown) =>
			showError(
				t("settings.errorTitle"),
				getErrorMessage(err, t("settings.errorTitle")),
			),
	});

	const {
		data: phoneStatus,
		isLoading: phoneStatusLoading,
		refetch: refetchPhoneStatus,
	} = useQuery({
		queryKey: ["phone-verification-status"],
		queryFn: () =>
			api.get<PhoneVerificationStatus>("/api/account/phone/status"),
		enabled: !!user,
	});

	useEffect(() => {
		setPhoneInput(phoneStatus?.pendingPhone ?? phoneStatus?.phone ?? "");
	}, [phoneStatus?.pendingPhone, phoneStatus?.phone]);

	const { mutate: startPhoneVerification, isPending: phoneStartLoading } =
		useMutation({
			mutationFn: () =>
				api.post<{ message: string }>("/api/account/phone/start", {
					phone: phoneInput,
				}),
			onSuccess: async (data) => {
				await refetchPhoneStatus();
				setOtpCode("");
				showSuccess(
					t("settings.phoneCodeSentTitle"),
					data.message || t("settings.phoneCodeSentMessage"),
				);
			},
			onError: (err: unknown) =>
				showError(
					t("settings.errorTitle"),
					getErrorMessage(err, t("settings.errorTitle")),
				),
		});

	const { mutate: verifyPhoneCode, isPending: phoneVerifyLoading } =
		useMutation({
			mutationFn: () =>
				api.post<{ message: string }>("/api/account/phone/verify", {
					code: otpCode,
				}),
			onSuccess: async (data) => {
				await refetchPhoneStatus();
				await refreshUser();
				setOtpCode("");
				showSuccess(
					t("settings.phoneVerifiedTitle"),
					data.message || t("settings.phoneVerifiedMessage"),
				);
			},
			onError: (err: unknown) =>
				showError(
					t("settings.errorTitle"),
					getErrorMessage(err, t("settings.errorTitle")),
				),
		});

	const handleSendPhoneCode = () => {
		if (!phoneInput) {
			showError(
				t("settings.errorTitle"),
				t("settings.phoneNumberRequiredError"),
			);
			return;
		}

		startPhoneVerification();
	};

	const handleVerifyPhoneCode = () => {
		if (!otpCode) {
			showError(t("settings.errorTitle"), t("settings.phoneCodeRequiredError"));
			return;
		}

		verifyPhoneCode();
	};

	const handleDeleteAccount = () => {
		showConfirm(
			t("settings.deleteConfirmTitle"),
			t("settings.deleteConfirmMessage"),
			async () => {
				try {
					await api.delete(`/api/users/${user?.id}`);
					await logout();
					router.replace("/(tabs)/home");
				} catch (err) {
					showError(
						t("settings.errorTitle"),
						getErrorMessage(err, t("settings.errorTitle")),
					);
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
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()} style={styles.backBtn}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: textColor }]}>
					{t("security.title")}
				</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView
				contentContainerStyle={[
					styles.scroll,
					{ backgroundColor: bg },
					centeredContent,
				]}
				showsVerticalScrollIndicator={false}
			>
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

				<Section
					title={t("settings.emailSection")}
					icon="mail-outline"
					{...sectionColors}
				>
					<View style={[styles.currentRow, { borderColor }]}>
						<Text style={[styles.currentLabel, { color: mutedColor }]}>
							{t("settings.currentLabel")}
						</Text>
						<Text style={[styles.currentValue, { color: textColor }]}>
							{user?.email}
						</Text>
					</View>
					<Text style={[styles.helperText, { color: mutedColor }]}>
						{t("settings.emailManagedMessage")}
					</Text>
				</Section>

				<Section
					title={t("settings.phoneSection")}
					icon="call-outline"
					{...sectionColors}
				>
					{phoneStatus?.phone && (
						<View style={[styles.currentRow, { borderColor }]}>
							<Text style={[styles.currentLabel, { color: mutedColor }]}>
								{t("settings.currentLabel")}
							</Text>
							<View style={{ alignItems: "flex-end", gap: 4 }}>
								<Text style={[styles.currentValue, { color: textColor }]}>
									{phoneStatus.phone}
								</Text>
								<Text style={[styles.helperText, { color: mutedColor }]}>
									{phoneStatus.isPhoneVerified
										? t("settings.phoneVerifiedBadge")
										: t("settings.phoneNotVerifiedBadge")}
								</Text>
							</View>
						</View>
					)}
					<Field
						label={t("settings.phoneNumberLabel")}
						value={phoneInput}
						onChange={setPhoneInput}
						placeholder={t("settings.phoneNumberPlaceholder")}
						icon="call-outline"
						{...fieldColors}
					/>
					<Pressable
						onPress={handleSendPhoneCode}
						disabled={phoneStartLoading || phoneStatusLoading}
						style={[
							styles.btn,
							{
								backgroundColor: primaryColor,
								opacity: phoneStartLoading || phoneStatusLoading ? 0.7 : 1,
							},
						]}
					>
						{phoneStartLoading ? (
							<ActivityIndicator color="#fff" />
						) : (
							<Text style={styles.btnText}>
								{phoneStatus?.hasPendingVerification
									? t("settings.resendPhoneCodeBtn")
									: t("settings.sendPhoneCodeBtn")}
							</Text>
						)}
					</Pressable>

					{phoneStatus?.hasPendingVerification && (
						<>
							<Field
								label={t("settings.phoneCodeLabel")}
								value={otpCode}
								onChange={setOtpCode}
								placeholder={t("settings.phoneCodePlaceholder")}
								icon="key-outline"
								{...fieldColors}
							/>
							<Pressable
								onPress={handleVerifyPhoneCode}
								disabled={phoneVerifyLoading}
								style={[
									styles.btnSecondary,
									{
										borderColor,
										backgroundColor: cardBg,
										opacity: phoneVerifyLoading ? 0.7 : 1,
									},
								]}
							>
								{phoneVerifyLoading ? (
									<ActivityIndicator color={primaryColor} />
								) : (
									<Text
										style={[styles.btnSecondaryText, { color: primaryColor }]}
									>
										{t("settings.verifyPhoneBtn")}
									</Text>
								)}
							</Pressable>
						</>
					)}
				</Section>

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
	helperText: {
		fontSize: 12,
		fontFamily: Fonts.body,
		lineHeight: 18,
	},
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
	btnSecondary: {
		borderRadius: 10,
		paddingVertical: 13,
		alignItems: "center",
		marginTop: 4,
		borderWidth: 1,
	},
	btnSecondaryText: {
		fontSize: 15,
		fontFamily: Fonts.displayBold,
	},
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
