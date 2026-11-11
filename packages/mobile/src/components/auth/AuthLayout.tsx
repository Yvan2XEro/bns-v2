import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, type Ref, useState } from "react";
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
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import { ShellPattern } from "@/src/components/brand/BackgroundPattern";
import { FormError } from "@/src/components/checkout/FormError";
import { dangerInk } from "@/src/components/shop/ink";
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
 * The frame every sign-in screen shares: an indigo ndop band carrying the
 * close/back button, the brand and the title, then the form straight on the
 * page below it — no card around it, inputs carry their own surface.
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
	const insets = useSafeAreaInsets();
	const shell = c.isDark ? "#13183e" : "#2a51c0";

	return (
		<SafeAreaView
			edges={["bottom"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<StatusBar style="light" />
			<KeyboardAwareScrollView
				style={styles.safe}
				contentContainerStyle={styles.scroll}
				keyboardShouldPersistTaps="handled"
				bottomOffset={20}
			>
				<View
					style={[
						styles.shell,
						{ backgroundColor: shell, paddingTop: insets.top + 8 },
					]}
				>
					<ShellPattern />
					<View style={centeredContent}>
						<Pressable
							onPress={onClose}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel={t(
								closeIcon === "close" ? "common.close" : "common.back",
							)}
							style={styles.roundBtn}
						>
							<Ionicons name={closeIcon} size={20} color="#ffffff" />
						</Pressable>
						<View style={styles.shellBody}>
							<BrandRow />
							<Text accessibilityRole="header" style={styles.title}>
								{title}
							</Text>
							{subtitle ? (
								<Text style={styles.subtitle}>{subtitle}</Text>
							) : null}
						</View>
					</View>
				</View>
				<View style={[styles.container, centeredContent]}>
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
				source={require("@/assets/icon2-dark.png")}
				style={styles.brandIcon}
				contentFit="contain"
			/>
			<Text style={styles.brandText} accessibilityLabel="Buy'N'Sellem">
				Buy<Text style={{ color: c.sell }}>'N'</Text>Sellem
			</Text>
		</View>
	);
}

type FieldIcon = "mail-outline" | "lock-closed-outline" | "person-outline";

/**
 * Label + input in the app's form style; the password variant can reveal.
 * `error` marks the field: a string is said under it, `true` only colours
 * the border (the message sits elsewhere, under the form).
 */
export function AuthField({
	label,
	icon,
	value,
	onChangeText,
	password,
	trailingLabel,
	error,
	inputRef,
	...input
}: {
	label: string;
	icon: FieldIcon;
	value: string;
	onChangeText: (text: string) => void;
	password?: boolean;
	/** Right of the label, e.g. "Forgot password?". */
	trailingLabel?: ReactNode;
	error?: string | boolean | null;
	/** To move focus here from the field before it. */
	inputRef?: Ref<TextInput>;
} & Pick<
	TextInputProps,
	| "placeholder"
	| "keyboardType"
	| "autoComplete"
	| "autoCapitalize"
	| "returnKeyType"
	| "onSubmitEditing"
	| "submitBehavior"
>) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [focused, setFocused] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const danger = dangerInk(c);
	const tokens = Colors[c.isDark ? "dark" : "light"];
	const message = typeof error === "string" ? error : null;

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
						borderColor: error
							? danger
							: focused
								? c.primary
								: tokens.borderStrong,
						borderWidth: focused || error ? 1.5 : 1,
					},
				]}
			>
				<Ionicons name={icon} size={18} color={focused ? c.link : c.muted} />
				<TextInput
					{...input}
					ref={inputRef}
					value={value}
					onChangeText={onChangeText}
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					secureTextEntry={password && !revealed}
					accessibilityLabel={label}
					accessibilityHint={message ?? undefined}
					aria-invalid={Boolean(error)}
					placeholderTextColor={c.muted}
					selectionColor={c.primary}
					style={[styles.input, { color: c.text }]}
				/>
				{password ? (
					<Pressable
						onPress={() => setRevealed((on) => !on)}
						hitSlop={14}
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
			<FormError message={message} />
		</View>
	);
}

/**
 * The form's one action, filled. `secondary` is the quieter way out beside
 * it (back to sign-in): a card button in brand words.
 */
export function AuthSubmit({
	label,
	onPress,
	loading,
	disabled,
	variant = "primary",
}: {
	label: string;
	onPress: () => void;
	loading?: boolean;
	disabled?: boolean;
	variant?: "primary" | "secondary";
}) {
	const c = useShopTheme();
	const off = loading || disabled;
	const secondary = variant === "secondary";
	return (
		<AnimatedPressable
			onPress={onPress}
			disabled={off}
			scaleTo={0.98}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
			style={[
				styles.submit,
				secondary
					? {
							backgroundColor: c.card,
							borderColor: c.border,
							borderWidth: 1,
						}
					: { backgroundColor: c.fill },
				{ opacity: off ? 0.6 : 1 },
			]}
		>
			{loading ? (
				<ActivityIndicator color={secondary ? c.link : "#fff"} />
			) : (
				<Text style={[styles.submitText, secondary && { color: c.link }]}>
					{label}
				</Text>
			)}
		</AnimatedPressable>
	);
}

/**
 * A page of the sign-in flow that waits on the inbox: the mail tile, the
 * title and what to do, then its actions. Same ground and type as the forms.
 */
export function AuthNotice({
	icon,
	title,
	children,
	actions,
}: {
	icon: "mail-outline" | "mail-unread-outline";
	title: string;
	children: ReactNode;
	actions: ReactNode;
}) {
	const c = useShopTheme();
	const { centeredContent } = useResponsive();
	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
			<View style={[styles.notice, centeredContent]}>
				<View style={[styles.noticeTile, { backgroundColor: c.primarySoft }]}>
					<Ionicons name={icon} size={30} color={c.link} />
				</View>
				<Text
					accessibilityRole="header"
					style={[styles.noticeTitle, { color: c.text }]}
				>
					{title}
				</Text>
				{children}
				<View style={styles.noticeActions}>{actions}</View>
			</View>
		</SafeAreaView>
	);
}

/** Running text on a notice page. */
export function AuthNoticeText({
	children,
	tone = "body",
}: {
	children: ReactNode;
	tone?: "body" | "hint" | "success" | "danger";
}) {
	const c = useShopTheme();
	const color =
		tone === "success"
			? c.successText
			: tone === "danger"
				? c.dangerText
				: tone === "hint"
					? c.muted
					: c.body;
	return (
		<Text
			style={[
				tone === "body" ? styles.noticeBody : styles.noticeHint,
				{ color },
			]}
			accessibilityLiveRegion={
				tone === "success" || tone === "danger" ? "polite" : undefined
			}
		>
			{children}
		</Text>
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
			<Pressable onPress={onPress} hitSlop={12} accessibilityRole="link">
				<Text style={[styles.switchLink, { color: c.link }]}>{action}</Text>
			</Pressable>
		</View>
	);
}

/** Quiet words on the shell: 4.6:1 on the day blue, 11:1 on the night one. */
const SHELL_MUTED = Colors.light.shellMuted;

const styles = StyleSheet.create({
	safe: { flex: 1 },
	shell: {
		paddingHorizontal: 20,
		paddingBottom: 28,
		borderBottomLeftRadius: 24,
		borderBottomRightRadius: 24,
		overflow: "hidden",
	},
	shellBody: { marginTop: 20 },
	roundBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.16)",
		backgroundColor: "rgba(255,255,255,0.12)",
		alignItems: "center",
		justifyContent: "center",
	},
	scroll: { flexGrow: 1, paddingBottom: 32 },
	container: { paddingHorizontal: 20 },
	brand: { flexDirection: "row", alignItems: "center", gap: 8 },
	brandIcon: { width: 32, height: 32, borderRadius: 9 },
	brandText: {
		color: "#ffffff",
		fontSize: 19,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.5,
	},
	title: {
		color: "#ffffff",
		fontSize: 32,
		lineHeight: 37,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.9,
		marginTop: 24,
	},
	subtitle: {
		color: SHELL_MUTED,
		fontSize: 15,
		fontFamily: Fonts.body,
		lineHeight: 22,
		marginTop: 8,
	},
	form: { gap: 16, marginTop: 24 },
	footer: { marginTop: 24 },
	field: { gap: 6 },
	labelRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	label: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.bodySemibold },
	inputRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 52,
		borderRadius: 12,
		paddingHorizontal: 14,
	},
	// Android's TextInput carries its own vertical padding.
	input: {
		flex: 1,
		fontSize: 16,
		fontFamily: Fonts.body,
		paddingVertical: 12,
	},
	submit: {
		minHeight: 52,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 4,
	},
	submitText: { color: "#fff", fontSize: 16, fontFamily: Fonts.bodyBold },
	switchRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "center",
	},
	notice: { flex: 1, justifyContent: "center", padding: 24 },
	noticeTile: {
		width: 64,
		height: 64,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	noticeTitle: {
		fontSize: 28,
		lineHeight: 33,
		fontFamily: Fonts.displayExtrabold,
		letterSpacing: -0.6,
		marginTop: 20,
	},
	noticeBody: {
		fontSize: 16,
		fontFamily: Fonts.body,
		lineHeight: 24,
		marginTop: 10,
		maxWidth: 520,
	},
	noticeHint: {
		fontSize: 14,
		fontFamily: Fonts.body,
		lineHeight: 20,
		marginTop: 12,
		maxWidth: 520,
	},
	noticeActions: { marginTop: 28, gap: 12 },
	switchText: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	switchLink: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodyBold },
});
