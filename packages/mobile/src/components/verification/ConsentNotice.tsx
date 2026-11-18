import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { fillOf } from "@/src/components/shop/ink";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";

const NOTICE_KEYS = [
	"collects",
	"vendor",
	"retention",
	"rights",
	"contact",
] as const;

/**
 * The legal record itself: what is collected, who processes it and for how
 * long, before a single byte reaches the vendor. The checkbox is never
 * pre-ticked — `checked` is owned by the caller's form state, this
 * component only renders the notice and reports a tap.
 */
export function ConsentNotice({
	checked,
	onToggle,
	error,
	method = "vendor",
}: {
	checked: boolean;
	onToggle: (checked: boolean) => void;
	error?: string | null;
	/** `manual`: the photos stay with us and a moderator reviews them. */
	method?: "manual" | "vendor";
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const ns =
		method === "manual"
			? "verification.identity.manualConsent"
			: "verification.identity.consent";

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.title, { color: c.text }]}>{t(`${ns}.title`)}</Text>
			<Text style={[styles.paragraph, { color: c.body }]}>
				{t(`${ns}.intro`)}
			</Text>
			{NOTICE_KEYS.map((key) => (
				<Text key={key} style={[styles.paragraph, { color: c.body }]}>
					{t(`${ns}.${key}`)}
				</Text>
			))}

			<Pressable
				accessibilityRole="checkbox"
				accessibilityState={{ checked }}
				accessibilityLabel={t(`${ns}.checkboxLabel`)}
				onPress={() => onToggle(!checked)}
				style={styles.checkboxRow}
				hitSlop={6}
			>
				<View
					style={[
						styles.box,
						{ borderColor: checked ? c.primary : c.border },
						checked ? { backgroundColor: fillOf(c) } : null,
					]}
				>
					{checked ? (
						<Ionicons name="checkmark" size={14} color="#ffffff" />
					) : null}
				</View>
				<Text style={[styles.checkboxLabel, { color: c.text }]}>
					{t(`${ns}.checkboxLabel`)}
				</Text>
			</Pressable>

			{error ? (
				<Text
					accessibilityRole="alert"
					style={[styles.error, { color: c.dangerText }]}
				>
					{error}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 10,
	},
	title: { fontSize: 16, lineHeight: 22, fontFamily: Fonts.displayBold },
	paragraph: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 20 },
	checkboxRow: {
		marginTop: 4,
		minHeight: 48,
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	box: {
		width: 22,
		height: 22,
		borderRadius: 6,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
	},
	checkboxLabel: {
		flex: 1,
		fontSize: 13,
		fontFamily: Fonts.bodyMedium,
		lineHeight: 19,
	},
	error: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.bodySemibold },
});
