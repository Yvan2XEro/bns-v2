import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	type TextInputProps,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { SocialAuthButtons } from "@/src/components/auth/SocialAuthButtons";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";

function AppLogo({ isDark }: { isDark: boolean }) {
	const baseColor = isDark ? "#e2e8f0" : "#0f172a";
	return (
		<View style={styles.logoBlock}>
			<Image
				source={require("@/assets/icon2.png")}
				style={styles.logoImg}
				contentFit="contain"
			/>
			<Text style={[styles.logoText, { color: baseColor }]}>
				Buy
				<Text style={{ color: "#f59e0b" }}>'</Text>
				<Text style={{ color: "#f59e0b" }}>N</Text>
				<Text style={{ color: "#f59e0b" }}>'</Text>Sellem
			</Text>
		</View>
	);
}

interface RegisterFieldProps {
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
	keyboard?: TextInputProps["keyboardType"];
	secure?: boolean;
	showToggle?: boolean;
	toggleShow?: () => void;
	autoComplete?: TextInputProps["autoComplete"];
	icon?: keyof typeof Ionicons.glyphMap;
	mutedColor: string;
	borderColor: string;
	textColor: string;
}

function RegisterField({
	label,
	value,
	onChange,
	placeholder,
	keyboard,
	secure,
	showToggle,
	toggleShow,
	autoComplete,
	icon,
	mutedColor,
	borderColor,
	textColor,
}: RegisterFieldProps) {
	return (
		<View style={{ gap: 6 }}>
			<Text style={[styles.fieldLabel, { color: mutedColor }]}>{label}</Text>
			<View style={[styles.inputWrapper, { borderColor }]}>
				{icon && (
					<Ionicons
						name={icon}
						size={18}
						color={mutedColor}
						style={styles.inputIcon}
					/>
				)}
				<TextInput
					value={value}
					onChangeText={onChange}
					placeholder={placeholder}
					placeholderTextColor={mutedColor}
					style={[styles.input, { color: textColor }]}
					keyboardType={keyboard ?? "default"}
					secureTextEntry={secure}
					autoCapitalize={keyboard === "email-address" ? "none" : "words"}
					autoComplete={autoComplete}
				/>
				{showToggle && (
					<Pressable onPress={toggleShow} hitSlop={8}>
						<Ionicons
							name={!secure ? "eye-off-outline" : "eye-outline"}
							size={18}
							color={mutedColor}
						/>
					</Pressable>
				)}
			</View>
		</View>
	);
}

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

export default function RegisterScreen() {
	const isDark = useColorScheme() === "dark";
	const { loginWithProvider, register } = useAuth();
	const { showError } = useAlert();
	const { t } = useTranslation();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [showPwd, setShowPwd] = useState(false);
	const [loading, setLoading] = useState(false);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const fieldColors = { mutedColor, borderColor, textColor };

	const handleRegister = async () => {
		if (!name || !email || !password || !confirm) {
			showError(t("auth.missingFieldsTitle"), t("auth.missingFieldsMessage"));
			return;
		}
		if (password.length < 8) {
			showError(
				t("auth.passwordTooShortTitle"),
				t("auth.passwordTooShortMessage"),
			);
			return;
		}
		if (password !== confirm) {
			showError(
				t("auth.passwordMismatchTitle"),
				t("auth.passwordMismatchMessage"),
			);
			return;
		}
		setLoading(true);
		try {
			await register(name.trim(), email.trim().toLowerCase(), password);
			router.dismiss();
		} catch (err: unknown) {
			showError(
				t("auth.registerFailedTitle"),
				getErrorMessage(err, t("auth.registerFailedMessage")),
			);
		} finally {
			setLoading(false);
		}
	};

	const handleSocialLogin = async (
		provider: "apple" | "facebook" | "google",
	) => {
		setLoading(true);
		try {
			await loginWithProvider(provider);
			router.dismiss();
		} catch (err: unknown) {
			showError(
				t("auth.registerFailedTitle"),
				getErrorMessage(err, t("auth.socialLoginFailedMessage")),
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<KeyboardAwareScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{ flexGrow: 1 }}
				keyboardShouldPersistTaps="handled"
				bottomOffset={20}
			>
				<Pressable onPress={() => router.dismiss()} style={styles.closeBtn}>
					<Ionicons name="arrow-back" size={24} color={textColor} />
				</Pressable>

				<View style={styles.container}>
					{/* Logo */}
					<View style={styles.logoWrap}>
						<AppLogo isDark={isDark} />
					</View>
					<Text style={[styles.title, { color: textColor }]}>
						{t("auth.registerTitle")}
					</Text>
					<Text style={[styles.subtitle, { color: mutedColor }]}>
						{t("auth.registerSubtitleShort")}
					</Text>

					<View style={[styles.form, { backgroundColor: cardBg, borderColor }]}>
						<SocialAuthButtons
							borderColor={borderColor}
							mutedColor={mutedColor}
							onPress={handleSocialLogin}
							primaryColor={primaryColor}
						/>
						<RegisterField
							label={t("auth.name")}
							value={name}
							onChange={setName}
							placeholder={t("auth.fullNamePlaceholder")}
							autoComplete="name"
							icon="person-outline"
							{...fieldColors}
						/>
						<RegisterField
							label={t("auth.email")}
							value={email}
							onChange={setEmail}
							placeholder={t("auth.emailPlaceholder")}
							keyboard="email-address"
							autoComplete="email"
							icon="mail-outline"
							{...fieldColors}
						/>
						<RegisterField
							label={t("auth.password")}
							value={password}
							onChange={setPassword}
							placeholder={t("auth.passwordMinHint")}
							secure={!showPwd}
							showToggle
							toggleShow={() => setShowPwd(!showPwd)}
							autoComplete="new-password"
							icon="lock-closed-outline"
							{...fieldColors}
						/>
						<RegisterField
							label={t("auth.confirmPassword")}
							value={confirm}
							onChange={setConfirm}
							placeholder={t("auth.confirmPasswordPlaceholder")}
							secure={!showPwd}
							autoComplete="new-password"
							icon="lock-closed-outline"
							{...fieldColors}
						/>

						<AnimatedPressable
							onPress={handleRegister}
							disabled={loading}
							scaleTo={0.97}
							style={[
								styles.submitBtn,
								{ backgroundColor: primaryColor, opacity: loading ? 0.7 : 1 },
							]}
						>
							{loading ? (
								<ActivityIndicator color="#fff" />
							) : (
								<Text style={styles.submitText}>
									{t("auth.createMyAccount")}
								</Text>
							)}
						</AnimatedPressable>

						<Text style={[styles.termsText, { color: mutedColor }]}>
							{t("auth.termsPrefix")}{" "}
							<Text
								style={{ color: primaryColor }}
								onPress={() => router.push("/terms")}
							>
								{t("auth.termsLink")}
							</Text>{" "}
							{t("auth.privacyPrefix")}{" "}
							<Text
								style={{ color: primaryColor }}
								onPress={() => router.push("/privacy")}
							>
								{t("auth.privacyLink")}
							</Text>
							.
						</Text>
					</View>

					<View style={styles.loginRow}>
						<Text style={[styles.loginText, { color: mutedColor }]}>
							{t("auth.alreadyHaveAccount")}{" "}
						</Text>
						<Pressable
							onPress={() => {
								router.dismiss();
								router.push("/auth/login");
							}}
						>
							<Text style={[styles.loginLink, { color: primaryColor }]}>
								{t("auth.signIn")}
							</Text>
						</Pressable>
					</View>
				</View>
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	closeBtn: { padding: 16, alignSelf: "flex-start" },
	container: { flex: 1, padding: 24, paddingTop: 8 },
	logoWrap: { alignItems: "center", marginBottom: 16 },
	logoBlock: { alignItems: "center", gap: 10 },
	logoImg: { width: 72, height: 72, borderRadius: 18 },
	logoText: {
		fontSize: 28,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.5,
	},
	title: {
		fontSize: 24,
		fontFamily: Fonts.displayExtrabold,
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlign: "center",
		marginBottom: 24,
		lineHeight: 20,
	},
	form: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 14 },
	fieldLabel: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	inputWrapper: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 12,
	},
	inputIcon: { marginRight: 10 },
	input: { flex: 1, fontSize: 15, fontFamily: Fonts.body },
	submitBtn: {
		borderRadius: 12,
		paddingVertical: 15,
		alignItems: "center",
		marginTop: 4,
	},
	submitText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
	termsText: { fontSize: 12, textAlign: "center", lineHeight: 18 },
	loginRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginTop: 20,
	},
	loginText: { fontSize: 14, fontFamily: Fonts.body },
	loginLink: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
