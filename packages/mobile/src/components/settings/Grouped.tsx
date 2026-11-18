import { Ionicons } from "@expo/vector-icons";
import {
	Children,
	Fragment,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react";
import {
	Platform,
	Pressable,
	type StyleProp,
	StyleSheet,
	Switch,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type IconName = keyof typeof Ionicons.glyphMap;

/** The rows a section was given, with fragments and conditionals unwrapped. */
function flattenRows(children: ReactNode): ReactElement[] {
	return Children.toArray(children).flatMap((child) => {
		if (!isValidElement(child)) return [];
		if (child.type === Fragment) {
			return flattenRows((child.props as { children?: ReactNode }).children);
		}
		return [child];
	});
}

/** The platform palette for the current scheme, with `isDark` beside it. */
export function useGroupedColors() {
	const isDark = useColorScheme() === "dark";
	return { ...Colors[isDark ? "dark" : "light"], isDark };
}

/**
 * Settings-shaped content as a native grouped inset list: an optional
 * sentence-case header outside the card, rows split by hairlines inset to
 * the text, and an optional footnote under it.
 */
export function GroupedSection({
	title,
	footer,
	children,
	style,
	inset = 16,
}: {
	title?: string;
	footer?: ReactNode;
	children: ReactNode;
	style?: StyleProp<ViewStyle>;
	/** Where the hairline between rows starts; 58 lines it up past an icon. */
	inset?: number;
}) {
	const c = useGroupedColors();
	const rows = flattenRows(children);
	return (
		<View style={[styles.section, style]}>
			{title ? (
				<Text
					accessibilityRole="header"
					style={[styles.sectionTitle, { color: c.mutedForeground }]}
				>
					{title}
				</Text>
			) : null}
			<View
				style={[
					styles.card,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				{rows.map((row, i) => (
					<Fragment key={`${i}:${String(row.key)}`}>
						{i > 0 ? (
							<View
								style={[
									styles.separator,
									{ backgroundColor: c.border, marginLeft: inset },
								]}
							/>
						) : null}
						{row}
					</Fragment>
				))}
			</View>
			{footer ? (
				typeof footer === "string" ? (
					<Text style={[styles.footer, { color: c.mutedForeground }]}>
						{footer}
					</Text>
				) : (
					<View style={styles.footerBox}>{footer}</View>
				)
			) : null}
		</View>
	);
}

export type RowIconTone = "neutral" | "brand" | "sun" | "danger";

function useIconTone(tone: RowIconTone) {
	const c = useGroupedColors();
	switch (tone) {
		case "brand":
			return { bg: c.primaryTint, fg: c.link };
		case "sun":
			return { bg: c.sunTint, fg: c.warningText };
		case "danger":
			return { bg: c.dangerTint, fg: c.isDark ? c.dangerText : c.destructive };
		default:
			return { bg: c.well, fg: c.body };
	}
}

/** The square tile an icon sits in at the head of a row. */
export function RowIcon({
	name,
	tone = "neutral",
}: {
	name: IconName;
	tone?: RowIconTone;
}) {
	const t = useIconTone(tone);
	return (
		<View style={[styles.iconBox, { backgroundColor: t.bg }]}>
			<Ionicons name={name} size={17} color={t.fg} />
		</View>
	);
}

/**
 * One row of a grouped list. Pressable when it has `onPress`, with the
 * platform's own press highlight instead of a bounce; `accessory` defaults to
 * a chevron for a row that navigates.
 */
export function GroupedRow({
	icon,
	iconTone = "neutral",
	label,
	detail,
	value,
	trailing,
	accessory,
	onPress,
	destructive,
	selected,
	disabled,
	accessibilityLabel,
	accessibilityHint,
	accessibilityRole,
	testID,
}: {
	icon?: IconName;
	iconTone?: RowIconTone;
	label: string;
	/** A second line under the label. */
	detail?: string | null;
	/** Current value, set on the right before the accessory. */
	value?: string | null;
	/** Anything else on the right: a badge, a pill. */
	trailing?: ReactNode;
	accessory?: "chevron" | "external" | "check" | "none";
	onPress?: () => void;
	destructive?: boolean;
	/** Open in the pane beside the list on a tablet. */
	selected?: boolean;
	disabled?: boolean;
	accessibilityLabel?: string;
	accessibilityHint?: string;
	accessibilityRole?: "button" | "link" | "radio";
	testID?: string;
}) {
	const c = useGroupedColors();
	const danger = c.isDark ? c.dangerText : c.destructive;
	const resolvedAccessory = accessory ?? (onPress ? "chevron" : "none");
	const labelColor = destructive ? danger : c.foreground;

	const body = (
		<>
			{icon ? (
				<RowIcon name={icon} tone={destructive ? "danger" : iconTone} />
			) : null}
			<View style={styles.text}>
				<Text style={[styles.label, { color: labelColor }]}>{label}</Text>
				{detail ? (
					<Text style={[styles.detail, { color: c.mutedForeground }]}>
						{detail}
					</Text>
				) : null}
			</View>
			{value ? (
				<Text
					style={[styles.value, { color: c.mutedForeground }]}
					numberOfLines={1}
				>
					{value}
				</Text>
			) : null}
			{trailing}
			{resolvedAccessory === "chevron" ? (
				<Ionicons name="chevron-forward" size={16} color={c.faint} />
			) : resolvedAccessory === "external" ? (
				<Ionicons name="open-outline" size={16} color={c.faint} />
			) : resolvedAccessory === "check" ? (
				<Ionicons name="checkmark" size={20} color={c.link} />
			) : null}
		</>
	);

	const selectedBg = selected ? { backgroundColor: c.primaryTint } : null;

	if (!onPress) {
		return (
			<View
				style={[styles.row, selectedBg]}
				accessible
				accessibilityLabel={
					accessibilityLabel ??
					[label, detail, value].filter(Boolean).join(", ")
				}
				testID={testID}
			>
				{body}
			</View>
		);
	}

	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			testID={testID}
			accessibilityRole={accessibilityRole ?? "button"}
			accessibilityLabel={
				accessibilityLabel ?? [label, value].filter(Boolean).join(", ")
			}
			accessibilityHint={accessibilityHint}
			accessibilityState={{
				disabled: Boolean(disabled),
				selected: Boolean(selected),
				...(accessibilityRole === "radio"
					? { checked: resolvedAccessory === "check" }
					: null),
			}}
			android_ripple={{ color: c.well }}
			style={({ pressed }) => [
				styles.row,
				selectedBg,
				pressed && Platform.OS === "ios" ? { backgroundColor: c.well } : null,
				disabled ? { opacity: 0.5 } : null,
			]}
		>
			{body}
		</Pressable>
	);
}

/** A row whose control is a native switch; the whole row toggles it. */
export function GroupedSwitchRow({
	icon,
	iconTone = "neutral",
	label,
	detail,
	value,
	onValueChange,
	disabled,
	testID,
}: {
	icon?: IconName;
	iconTone?: RowIconTone;
	label: string;
	detail?: string | null;
	value: boolean;
	onValueChange: (next: boolean) => void;
	disabled?: boolean;
	testID?: string;
}) {
	const c = useGroupedColors();
	return (
		<Pressable
			onPress={() => onValueChange(!value)}
			disabled={disabled}
			testID={testID}
			accessibilityRole="switch"
			accessibilityLabel={label}
			accessibilityHint={detail ?? undefined}
			accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
			style={[styles.row, disabled ? { opacity: 0.5 } : null]}
		>
			{icon ? <RowIcon name={icon} tone={iconTone} /> : null}
			<View style={styles.text}>
				<Text style={[styles.label, { color: c.foreground }]}>{label}</Text>
				{detail ? (
					<Text style={[styles.detail, { color: c.mutedForeground }]}>
						{detail}
					</Text>
				) : null}
			</View>
			<Switch
				value={value}
				onValueChange={onValueChange}
				disabled={disabled}
				// The row carries the role and label; the switch is its control.
				accessible={false}
				importantForAccessibility="no"
				trackColor={{ false: c.borderStrong, true: c.primaryFill }}
				thumbColor="#ffffff"
				ios_backgroundColor={c.borderStrong}
			/>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	section: { gap: 8 },
	sectionTitle: {
		fontFamily: Fonts.bodySemibold,
		fontSize: 13,
		lineHeight: 18,
		marginLeft: 16,
	},
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	separator: { height: StyleSheet.hairlineWidth },
	footer: {
		fontFamily: Fonts.body,
		fontSize: 13,
		lineHeight: 18,
		marginHorizontal: 16,
	},
	footerBox: { marginHorizontal: 16 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 52,
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	iconBox: {
		width: 30,
		height: 30,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	text: { flex: 1, gap: 2 },
	label: { fontFamily: Fonts.bodyMedium, fontSize: 16, lineHeight: 21 },
	detail: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
	value: {
		fontFamily: Fonts.body,
		fontSize: 15,
		lineHeight: 22,
		maxWidth: "45%",
	},
});
