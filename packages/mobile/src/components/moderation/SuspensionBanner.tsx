import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useAuth } from "@/src/lib/auth";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { suspensionOf } from "@/src/lib/moderation";
import { useModerationTheme } from "./theme";
import { tonesOf } from "./tones";

/**
 * Tells a suspended account what happened and when it ends. Without it the
 * only signal is publishing and messaging failing, which reads as a broken
 * app rather than a sanction — and is what turns a moderation decision into
 * a store complaint.
 */
export function SuspensionBanner() {
	const { user } = useAuth();
	const { t } = useTranslation();
	const c = useModerationTheme();
	const k = tonesOf(c);
	const suspension = suspensionOf(user);

	if (!suspension.active) return null;

	const until = suspension.until ? formatDate(suspension.until) : null;

	return (
		<View
			style={[
				styles.banner,
				{ backgroundColor: c.dangerSoft, borderColor: k.dangerText },
			]}
		>
			<Ionicons name="alert-circle" size={20} color={k.dangerText} />
			<View style={styles.text}>
				<Text style={[styles.title, { color: k.dangerText }]}>
					{t("moderation.bannerTitle")}
				</Text>
				<Text style={[styles.body, { color: c.text }]}>
					{suspension.indefinite || !until
						? t("moderation.bannerIndefinite")
						: t("moderation.bannerUntil", { date: until })}
				</Text>
				{user?.suspendedReason ? (
					<Text style={[styles.reason, { color: c.text }]}>
						{t(`report.${user.suspendedReason}`)}
					</Text>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	banner: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		borderRadius: 14,
		borderWidth: 1,
		padding: 14,
		marginBottom: 16,
	},
	text: { flex: 1, gap: 3 },
	title: { fontSize: 16, lineHeight: 21, fontFamily: Fonts.displayBold },
	body: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 21 },
	reason: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.bodySemibold },
});
