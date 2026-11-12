import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useEffect } from "react";
import {
	ActivityIndicator,
	Pressable,
	type StyleProp,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { ERROR_CODES, hasErrorCode } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { type ModerationPalette, useModerationTheme } from "./theme";
import { type Tone, toneColors, tonesOf } from "./tones";

/**
 * The building blocks every moderation screen shares, so a decision looks
 * and behaves the same wherever it is taken: one button vocabulary, one
 * bottom bar, one way to say "loading", "failed" and "careful".
 */

// ─── Decision buttons ─────────────────────────────────────────────────────────

export type DecisionVariant =
	/** The forward action: approve, resolve, claim. Indigo fill. */
	| "primary"
	/** A positive outcome that changes someone's standing: approve, lift. Green fill. */
	| "approve"
	/** The sanction itself, once its sheet has been filled. Red fill. */
	| "danger"
	/** Opens a sanction or refusal: red outline, so it never reads as the default. */
	| "dangerOutline"
	/** Everything else: dismiss, cancel, release. Hairline outline. */
	| "secondary";

interface DecisionButtonProps {
	label: string;
	onPress: () => void;
	variant?: DecisionVariant;
	icon?: keyof typeof Ionicons.glyphMap;
	pending?: boolean;
	disabled?: boolean;
	/** Share of the row this button takes beside the others. */
	grow?: number;
	accessibilityHint?: string;
	style?: StyleProp<ViewStyle>;
}

export function DecisionButton({
	label,
	onPress,
	variant = "primary",
	icon,
	pending,
	disabled,
	grow = 1,
	accessibilityHint,
	style,
}: DecisionButtonProps) {
	const c = useModerationTheme();
	const k = tonesOf(c);
	const inactive = Boolean(disabled || pending);
	const filled =
		variant === "primary" || variant === "approve" || variant === "danger";

	const fill = !filled
		? c.card
		: disabled
			? k.disabledFill
			: variant === "approve"
				? k.successFill
				: variant === "danger"
					? k.dangerFill
					: k.primaryFill;
	const ink = filled
		? disabled
			? k.disabledText
			: k.onFill
		: variant === "dangerOutline"
			? k.dangerText
			: variant === "secondary"
				? c.text
				: k.linkText;
	const border = filled
		? fill
		: variant === "dangerOutline"
			? k.dangerText
			: k.strongBorder;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityHint={accessibilityHint}
			accessibilityState={{ disabled: inactive, busy: Boolean(pending) }}
			disabled={inactive}
			onPress={onPress}
			style={({ pressed }) => [
				styles.button,
				{
					flexGrow: grow,
					flexBasis: grow > 0 ? 0 : "auto",
					backgroundColor: fill,
					borderColor: border,
					opacity: pressed ? 0.85 : pending ? 0.8 : 1,
					transform: [{ scale: pressed ? 0.98 : 1 }],
				},
				style,
			]}
		>
			{pending ? (
				<ActivityIndicator color={ink} />
			) : (
				<>
					{icon ? <Ionicons name={icon} size={19} color={ink} /> : null}
					<Text style={[styles.buttonLabel, { color: ink }]} numberOfLines={2}>
						{label}
					</Text>
				</>
			)}
		</Pressable>
	);
}

/**
 * The bar pinned under a moderation sheet. It clears the home indicator
 * itself, so no screen hard-codes a bottom padding again.
 */
export function DecisionBar({
	children,
	note,
	wrap,
}: {
	children?: ReactNode;
	/** Shown above the buttons (a reason they are disabled), or alone. */
	note?: { text: string; tone?: Tone } | null;
	/** Lay the buttons out over several rows instead of one. */
	wrap?: boolean;
}) {
	const c = useModerationTheme();
	const insets = useSafeAreaInsets();
	const noteColor = note?.tone ? toneColors(note.tone, c).text : c.muted;
	return (
		<View
			style={[
				styles.bar,
				{
					backgroundColor: c.card,
					borderTopColor: c.border,
					paddingBottom: Math.max(insets.bottom, 12) + 4,
				},
			]}
		>
			{note ? (
				<Text
					style={[
						styles.barNote,
						{ color: noteColor, textAlign: children ? "left" : "center" },
					]}
				>
					{note.text}
				</Text>
			) : null}
			{children ? (
				<View style={[styles.barRow, wrap && styles.barWrap]}>{children}</View>
			) : null}
		</View>
	);
}

// ─── Text ─────────────────────────────────────────────────────────────────────

/** A section heading on the ground, between cards. */
export function SectionTitle({
	children,
	right,
}: {
	children: string;
	right?: ReactNode;
}) {
	const c = useModerationTheme();
	return (
		<View style={styles.sectionRow}>
			<Text
				accessibilityRole="header"
				style={[styles.sectionTitle, { color: c.text }]}
			>
				{children}
			</Text>
			{right}
		</View>
	);
}

/** A card with an optional heading: the one container every sheet uses. */
export function ModerationCard({
	title,
	right,
	children,
	style,
}: {
	title?: string;
	right?: ReactNode;
	children?: ReactNode;
	style?: StyleProp<ViewStyle>;
}) {
	const c = useModerationTheme();
	return (
		<View
			style={[
				styles.card,
				{ backgroundColor: c.card, borderColor: c.border },
				style,
			]}
		>
			{title ? (
				<View style={styles.cardHead}>
					<Text
						accessibilityRole="header"
						style={[styles.cardTitle, { color: c.text }]}
					>
						{title}
					</Text>
					{right}
				</View>
			) : null}
			{children}
		</View>
	);
}

/** A label / value line inside a card. */
export function FactRow({
	label,
	value,
	valueColor,
}: {
	label: string;
	value: string | null | undefined;
	valueColor?: string;
}) {
	const c = useModerationTheme();
	return (
		<View style={styles.factRow}>
			<Text style={[styles.factLabel, { color: c.muted }]}>{label}</Text>
			<Text
				style={[styles.factValue, { color: valueColor ?? c.text }]}
				numberOfLines={3}
			>
				{value || "—"}
			</Text>
		</View>
	);
}

/**
 * A hairline between groups of facts in one card: identity apart from
 * registry numbers, money apart from parties. Groups, not every row.
 */
export function CardDivider() {
	const c = useModerationTheme();
	return (
		<View
			accessible={false}
			importantForAccessibility="no"
			style={[styles.divider, { backgroundColor: c.border }]}
		/>
	);
}

/** A small status label on its soft tint. */
export function TonePill({ label, tone }: { label: string; tone: Tone }) {
	const c = useModerationTheme();
	const colors = toneColors(tone, c);
	return (
		<View style={[styles.pill, { backgroundColor: colors.soft }]}>
			<Text style={[styles.pillText, { color: colors.text }]}>{label}</Text>
		</View>
	);
}

/** An inline notice: a failed action, a saved one, a precondition. */
export function InlineNotice({
	text,
	tone = "negative",
}: {
	text: string;
	tone?: Tone;
}) {
	const c = useModerationTheme();
	const colors = toneColors(tone, c);
	const icon =
		tone === "positive"
			? "checkmark-circle"
			: tone === "warning"
				? "warning"
				: tone === "negative"
					? "alert-circle"
					: "information-circle";
	return (
		<View
			accessibilityRole={tone === "negative" ? "alert" : undefined}
			style={[styles.notice, { backgroundColor: colors.soft }]}
		>
			<Ionicons name={icon} size={18} color={colors.text} />
			<Text style={[styles.noticeText, { color: colors.text }]}>{text}</Text>
		</View>
	);
}

// ─── States ───────────────────────────────────────────────────────────────────

function usePulse() {
	const reduced = useReducedMotion();
	const opacity = useSharedValue(1);
	useEffect(() => {
		if (reduced) {
			opacity.value = 0.7;
			return;
		}
		opacity.value = withRepeat(
			withTiming(0.45, { duration: 800, easing: Easing.inOut(Easing.ease) }),
			-1,
			true,
		);
	}, [opacity, reduced]);
	return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

function Bone({
	width,
	height,
	radius = 6,
	c,
}: {
	width: number | `${number}%`;
	height: number;
	radius?: number;
	c: ModerationPalette;
}) {
	return (
		<View
			style={{
				width,
				height,
				borderRadius: radius,
				backgroundColor: c.border,
			}}
		/>
	);
}

/** Placeholder rows while a queue loads: the shape of the rows to come. */
export function QueueSkeleton({ rows = 6 }: { rows?: number }) {
	const c = useModerationTheme();
	const { t } = useTranslation();
	const pulse = usePulse();
	return (
		<Animated.View
			style={[styles.skeletonList, pulse]}
			accessibilityRole="progressbar"
			accessibilityLabel={t("common.loading")}
		>
			{Array.from({ length: rows }, (_, i) => (
				<View
					key={i}
					style={[
						styles.skeletonRow,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<Bone width={52} height={52} radius={10} c={c} />
					<View style={styles.skeletonText}>
						<Bone width="70%" height={14} c={c} />
						<Bone width="45%" height={12} c={c} />
					</View>
				</View>
			))}
		</Animated.View>
	);
}

/** Placeholder for a detail sheet: a header card and two blocks of facts. */
export function DetailSkeleton() {
	const c = useModerationTheme();
	const { t } = useTranslation();
	const pulse = usePulse();
	return (
		<Animated.View
			style={[styles.skeletonDetail, pulse]}
			accessibilityRole="progressbar"
			accessibilityLabel={t("common.loading")}
		>
			{[3, 4, 2].map((lines, block) => (
				<View
					key={block}
					style={[
						styles.card,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<Bone width="40%" height={18} c={c} />
					{Array.from({ length: lines }, (_, i) => (
						<Bone key={i} width={i % 2 ? "60%" : "85%"} height={13} c={c} />
					))}
				</View>
			))}
		</Animated.View>
	);
}

/** A request that never reached the server, or never came back. */
export function isConnectionError(error: unknown): boolean {
	return (
		hasErrorCode(error, ERROR_CODES.network) ||
		hasErrorCode(error, ERROR_CODES.timeout)
	);
}

/** A request the server refused for lack of rights (HTTP 403). */
export function isForbiddenError(error: unknown): boolean {
	return (
		Boolean(error) &&
		typeof error === "object" &&
		(error as { status?: unknown }).status === 403
	);
}

/**
 * The picture for a lost connection. A timeout on metered data must not
 * look like "this item does not exist", which is what the not-found
 * illustration says.
 */
export function OfflineMark() {
	const c = useModerationTheme();
	return (
		<View style={[styles.offlineMark, { backgroundColor: c.card }]}>
			<Ionicons name="cloud-offline-outline" size={44} color={c.muted} />
		</View>
	);
}

/** A sheet that could not load, with the way back in. */
export function LoadError({
	title,
	message,
	error,
	onRetry,
}: {
	title: string;
	message?: string;
	/** The failure itself: a lost connection gets its own title and picture. */
	error?: unknown;
	onRetry: () => void;
}) {
	const { t } = useTranslation();
	const offline = isConnectionError(error);
	return (
		<EmptyState
			illustration={offline ? undefined : "notFound"}
			illustrationNode={offline ? <OfflineMark /> : undefined}
			title={offline ? t("moderation.offlineTitle") : title}
			subtitle={message}
			ctaLabel={t("common.retry")}
			onCta={onRetry}
		/>
	);
}

const styles = StyleSheet.create({
	button: {
		minHeight: 52,
		minWidth: 120,
		borderRadius: 12,
		borderWidth: 1.5,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	buttonLabel: {
		fontSize: 16,
		lineHeight: 20,
		fontFamily: Fonts.bodyBold,
		textAlign: "center",
		flexShrink: 1,
	},
	bar: {
		paddingHorizontal: 16,
		paddingTop: 12,
		gap: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	barNote: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodyMedium },
	barRow: { flexDirection: "row", gap: 10 },
	barWrap: { flexWrap: "wrap" },
	sectionRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		marginTop: 10,
	},
	sectionTitle: {
		fontSize: 18,
		lineHeight: 26,
		letterSpacing: -0.2,
		fontFamily: Fonts.displayBold,
		flexShrink: 1,
	},
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 10,
	},
	cardHead: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		marginBottom: 2,
	},
	cardTitle: {
		fontSize: 18,
		lineHeight: 26,
		letterSpacing: -0.2,
		fontFamily: Fonts.displayBold,
		flexShrink: 1,
	},
	factRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 16,
	},
	factLabel: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	factValue: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
		flexShrink: 1,
		textAlign: "right",
	},
	divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
	pill: {
		alignSelf: "flex-start",
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	pillText: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.bodySemibold },
	notice: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	noticeText: {
		flex: 1,
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodyMedium,
	},
	skeletonList: { padding: 16, gap: 10 },
	skeletonRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 12,
	},
	skeletonText: { flex: 1, gap: 8 },
	skeletonDetail: { padding: 16, gap: 14 },
	offlineMark: {
		width: 96,
		height: 96,
		borderRadius: 48,
		alignItems: "center",
		justifyContent: "center",
	},
});
