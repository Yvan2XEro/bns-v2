import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { FormButton } from "@/src/components/settings/FormButton";
import { FormField } from "@/src/components/settings/FormField";
import {
	GroupedRow,
	GroupedSection,
	useGroupedColors,
} from "@/src/components/settings/Grouped";
import { SettingsHeader } from "@/src/components/settings/SettingsHeader";
import { useAlert } from "@/src/contexts/AlertContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { phoneExample } from "@/src/lib/market";

function getErrorMessage(error: unknown, fallback: string): string {
	// `error instanceof Error` was always true for a failed request, so the
	// fallback never fired and users saw raw API text. resolveErrorMessage maps
	// the error code to translated copy and keeps the fallback for the rest.
	return resolveErrorMessage(error, (key) => i18n.t(key), fallback);
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

export function SecurityScreen() {
	const { centeredContent } = useResponsive();
	const { user, logout, refreshUser } = useAuth();
	const { showSuccess, showError, showConfirm } = useAlert();
	const { t } = useTranslation();
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [phoneInput, setPhoneInput] = useState("");
	const [otpCode, setOtpCode] = useState("");

	const c = useGroupedColors();
	// What the forms refuse is said under the field, not in a sheet.
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [confirmError, setConfirmError] = useState<string | null>(null);
	const [phoneError, setPhoneError] = useState<string | null>(null);
	const [codeError, setCodeError] = useState<string | null>(null);

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

	const handleChangePassword = () => {
		const tooShort = newPassword.length < 8;
		const mismatch = !tooShort && newPassword !== confirmPassword;
		setPasswordError(tooShort ? t("settings.passwordTooShortError") : null);
		setConfirmError(mismatch ? t("settings.passwordMismatchError") : null);
		if (tooShort || mismatch) return;
		changePassword();
	};

	const handleSendPhoneCode = () => {
		if (!phoneInput.trim()) {
			setPhoneError(t("settings.phoneNumberRequiredError"));
			return;
		}
		setPhoneError(null);
		startPhoneVerification();
	};

	const handleVerifyPhoneCode = () => {
		if (!otpCode.trim()) {
			setCodeError(t("settings.phoneCodeRequiredError"));
			return;
		}
		setCodeError(null);
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

	const phoneBusy = phoneStartLoading || phoneStatusLoading;
	const verified = Boolean(phoneStatus?.isPhoneVerified);
	const statusColor = verified ? c.successText : c.warningText;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<SettingsHeader title={t("security.title")} />

			<KeyboardAwareScrollView
				contentContainerStyle={[styles.scroll, centeredContent]}
				keyboardShouldPersistTaps="handled"
				bottomOffset={20}
				showsVerticalScrollIndicator={false}
			>
				<GroupedSection
					title={t("settings.emailSection")}
					footer={t("settings.emailManagedMessage")}
				>
					<GroupedRow icon="mail-outline" label={user?.email ?? ""} />
				</GroupedSection>

				<GroupedSection title={t("settings.passwordSection")}>
					<View style={styles.form}>
						<FormField
							label={t("settings.newPasswordLabel")}
							value={newPassword}
							onChangeText={(text) => {
								setNewPassword(text);
								if (passwordError && text.length >= 8) setPasswordError(null);
							}}
							placeholder={t("settings.newPasswordPlaceholder")}
							secure
							autoCapitalize="none"
							autoComplete="new-password"
							error={passwordError}
						/>
						<FormField
							label={t("settings.confirmPasswordLabel")}
							value={confirmPassword}
							onChangeText={(text) => {
								setConfirmPassword(text);
								if (confirmError && text === newPassword) setConfirmError(null);
							}}
							placeholder={t("settings.confirmPasswordPlaceholder")}
							secure
							autoCapitalize="none"
							autoComplete="new-password"
							error={confirmError}
						/>
						<FormButton
							label={t("settings.changePasswordBtn")}
							onPress={handleChangePassword}
							loading={pwdLoading}
						/>
					</View>
				</GroupedSection>

				<GroupedSection title={t("settings.phoneSection")}>
					{phoneStatus?.phone ? (
						<GroupedRow
							icon="call-outline"
							label={phoneStatus.phone}
							accessibilityLabel={[
								phoneStatus.phone,
								verified
									? t("settings.phoneVerifiedBadge")
									: t("settings.phoneNotVerifiedBadge"),
							].join(", ")}
							trailing={
								<View style={styles.status}>
									<Ionicons
										name={verified ? "checkmark-circle" : "alert-circle"}
										size={15}
										color={statusColor}
									/>
									<Text style={[styles.statusText, { color: statusColor }]}>
										{verified
											? t("settings.phoneVerifiedBadge")
											: t("settings.phoneNotVerifiedBadge")}
									</Text>
								</View>
							}
						/>
					) : null}
					<View style={styles.form}>
						<FormField
							label={t("settings.phoneNumberLabel")}
							value={phoneInput}
							onChangeText={(text) => {
								setPhoneInput(text);
								if (phoneError) setPhoneError(null);
							}}
							placeholder={phoneExample()}
							keyboardType="phone-pad"
							autoComplete="tel"
							error={phoneError}
						/>
						<FormButton
							variant={
								phoneStatus?.hasPendingVerification ? "secondary" : "primary"
							}
							label={
								phoneStatus?.hasPendingVerification
									? t("settings.resendPhoneCodeBtn")
									: t("settings.sendPhoneCodeBtn")
							}
							onPress={handleSendPhoneCode}
							loading={phoneStartLoading}
							disabled={phoneBusy}
						/>
						{phoneStatus?.hasPendingVerification ? (
							<>
								<FormField
									label={t("settings.phoneCodeLabel")}
									value={otpCode}
									onChangeText={(text) => {
										setOtpCode(text);
										if (codeError) setCodeError(null);
									}}
									placeholder={t("settings.phoneCodePlaceholder")}
									keyboardType="number-pad"
									autoComplete="sms-otp"
									textContentType="oneTimeCode"
									error={codeError}
								/>
								<FormButton
									label={t("settings.verifyPhoneBtn")}
									onPress={handleVerifyPhoneCode}
									loading={phoneVerifyLoading}
								/>
							</>
						) : null}
					</View>
				</GroupedSection>

				{/* Native settings set the one destructive row apart in its own
				    untitled group; a "Delete account" title over a "Delete my
				    account" row would say it twice. */}
				<GroupedSection footer={t("settings.dangerDesc")}>
					<GroupedRow
						icon="trash-outline"
						label={t("settings.deleteMyAccount")}
						onPress={handleDeleteAccount}
						destructive
						accessory="none"
					/>
				</GroupedSection>
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	scroll: { padding: 16, paddingTop: 20, gap: 24, paddingBottom: 48 },
	form: { padding: 16, gap: 16 },
	status: { flexDirection: "row", alignItems: "center", gap: 4 },
	statusText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
