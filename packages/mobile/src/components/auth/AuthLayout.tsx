import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { type ReactNode, useState } from "react";
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
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { useShopTheme } from "@/src/components/shop/theme";
import { useResponsive } from "@/src/hooks/useResponsive";
import { resolveErrorMessage } from "@/src/lib/apiError";
import i18n, { useTranslation } from "@/src/lib/i18n";

/**
 * A failed auth request's message: the translated copy for a known error
 * code, else the screen's fallback — never raw API text.
 */
export function authErrorMessage(error: unknown, fallback: string): string {
	return resolveErrorMessage(error, (key) => i18n.t(key), fallback);
}

/**
 * The frame every sign-in screen shares: a round close/back button, the
 * brand row, a left-aligned title like the rest of the app, then the form
 * straight on the page — no card around it, inputs carry their own surface.
 */
export function AuthScreen({
	title,
	subtitle,
	onClose,
	closeIcon = "close",
	children,
	footer,
}: {
	title: string;
	subtitle?: string;
	onClose: () => void;
	closeIcon?: "close" | "arrow-back";
	children: ReactNode;
	footer?: ReactNode;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { centeredContent } = useResponsive();

	return (
		<SafeAreaView
			edges={["top", "bottom"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<View style={styles.topBar}>
				<Pressable
					onPress={onClose}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={t(
						closeIcon === "close" ? "common.close" : "common.back",
					)}
					style={[
						styles.roundBtn,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<Ionicons name={closeIcon} size={20} color={c.text} />
				</Pressable>
			</View>
			<KeyboardAwareScrollView
				style={styles.safe}
				contentContainerStyle={styles.scroll}
				keyboardShouldPersistTaps="handled"
				bottomOffset={20}
			>
				<View style={[styles.container, centeredContent]}>
					<BrandRow />
					<Text style={[styles.title, { color: c.text }]}>{title}</Text>
					{subtitle ? (
						<Text style={[styles.subtitle, { color: c.muted }]}>
							{subtitle}
						</Text>
					) : null}
					<View style={styles.form}>{children}</View>
					{footer ? <View style={styles.footer}>{footer}</View> : null}
				</View>
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

function BrandRow() {
	const c = useShopTheme();
	return (
		<View style={styles.brand}>
			<Image
				source={require("@/assets/icon2.png")}
				style={styles.brandIcon}
				contentFit="contain"
			/>
			<Text style={[styles.brandText, { color: c.text }]}>
				Buy<Text style={{ color: c.sell }}>'N'</Text>Sellem
			</Text>
		</View>
	);
}

type FieldIcon = "mail-outline" | "lock-closed-outline" | "person-outline";

/** Label + input in the app's form style; the password variant can reveal. */
export function AuthField({
	label,
	icon,
	value,
	onChangeText,
	password,
	trailingLabel,
	...input
}: {
	label: string;
	icon: FieldIcon;
	value: string;
	onChangeText: (text: string) => void;
	password?: boolean;
	/** Right of the label, e.g. "Forgot password?". */
	trailingLabel?: ReactNode;
} & Pick<
	TextInputProps,
	| "placeholder"
	| "keyboardType"
	| "autoComplete"
	| "autoCapitalize"
	| "returnKeyType"
	| "onSubmitEditing"
>) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [focused, setFocused] = useState(false);
	const [revealed, setRevealed] = useState(false);

	return (
		<View style={styles.field}>
			<View style={styles.labelRow}>
				<Text style={[styles.label, { color: c.body }]}>{label}</Text>
				{trailingLabel}
			</View>
			<View
				style={[
					styles.inputRow,
					{
						backgroundColor: c.card,
						borderColor: focused ? c.primary : c.border,
					},
				]}
			>
				<Ionicons name={icon} size={18} color={focused ? c.primary : c.muted} />
				<TextInput
					{...input}
					value={value}
					onChangeText={onChangeText}
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					secureTextEntry={password && !revealed}
					accessibilityLabel={label}
					placeholderTextColor={c.muted}
					style={[styles.input, { color: c.text }]}
				/>
				{password ? (
					<Pressable
						onPress={() => setRevealed((on) => !on)}
						hitSlop={10}
						accessibilityRole="button"
						accessibilityLabel={t(
							revealed ? "auth.hidePassword" : "auth.showPassword",
						)}
					>
						<Ionicons
							name={revealed ? "eye-off-outline" : "eye-outline"}
							size={18}
							color={c.muted}
						/>
					</Pressable>
				) : null}
			</View>
		</View>
	);
}

export function AuthSubmit({
	label,
	onPress,
	loading,
	disabled,
}: {
	label: string;
	onPress: () => void;
	loading?: boolean;
	disabled?: boolean;
}) {
	const c = useShopTheme();
	const off = loading || disabled;
	return (
		<AnimatedPressable
			onPress={onPress}
			disabled={off}
			scaleTo={0.98}
			accessibilityRole="button"
			style={[
				styles.submit,
				{ backgroundColor: c.primary, opacity: off ? 0.6 : 1 },
			]}
		>
			{loading ? (
				<ActivityIndicator color="#fff" />
			) : (
				<Text style={styles.submitText}>{label}</Text>
			)}
		</AnimatedPressable>
	);
}

/** "No account yet? Create one" — the line under the form. */
export function AuthSwitchLink({
	prompt,
	action,
	onPress,
}: {
	prompt: string;
	action: string;
	onPress: () => void;
}) {
	const c = useShopTheme();
	return (
		<View style={styles.switchRow}>
			<Text style={[styles.switchText, { color: c.muted }]}>{prompt} </Text>
			<Pressable onPress={onPress} hitSlop={8} accessibilityRole="link">
				<Text style={[styles.switchLink, { color: c.primary }]}>{action}</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	topBar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
	roundBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	scroll: { flexGrow: 1, paddingBottom: 32 },
	container: { paddingHorizontal: 20, paddingTop: 12 },
	brand: { flexDirection: "row", alignItems: "center", gap: 8 },
	brandIcon: { width: 36, height: 36, borderRadius: 10 },
	brandText: {
		fontSize: 20,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.3,
	},
	title: {
		fontSize: 28,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.4,
		marginTop: 28,
	},
	subtitle: {
		fontSize: 15,
		fontFamily: Fonts.body,
		lineHeight: 22,
		marginTop: 6,
	},
	form: { gap: 16, marginTop: 28 },
	footer: { marginTop: 24 },
	field: { gap: 6 },
	labelRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	inputRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 48,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
	},
	// Android's TextInput carries its own vertical padding.
	input: {
		flex: 1,
		fontSize: 15,
		fontFamily: Fonts.body,
		paddingVertical: 12,
	},
	submit: {
		minHeight: 50,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 4,
	},
	submitText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
	switchRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
	},
	switchText: { fontSize: 14, fontFamily: Fonts.body },
	switchLink: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
