import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import type { PendingInvitationView } from "@/src/types/api";
import { useShopTheme } from "../theme";

export const RESEND_LIMIT = 3;

const ROLE_KEY: Record<PendingInvitationView["role"], string> = {
	manager: "team.roleManager",
	staff: "team.roleStaff",
};

/**
 * One pending-invitation row. Resend and Revoke show only when `canManage`
 * — a manager's invitation is never actionable by a staff member, and a
 * manager cannot manage another manager's invitation either, mirroring
 * `memberActions`.
 */
export function PendingInvitationRow({
	invitation,
	canManage,
	onResend,
	onRevoke,
	resending,
	revoking,
}: {
	invitation: PendingInvitationView;
	canManage: boolean;
	onResend: () => void;
	onRevoke: () => void;
	resending: boolean;
	revoking: boolean;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const exhausted = invitation.sendCount >= RESEND_LIMIT;
	const expires = formatDate(
		invitation.expiresAt,
		{ day: "numeric", month: "short", year: "numeric" },
		i18n.language?.startsWith("en") ? "en-GB" : "fr-FR",
	);

	return (
		<View
			style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.body}>
				<Text style={[styles.target, { color: c.text }]} numberOfLines={1}>
					{invitation.maskedTarget}
				</Text>
				<Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>
					{t(ROLE_KEY[invitation.role])}
					{expires ? ` · ${t("team.expires", { date: expires })}` : ""}
				</Text>
			</View>
			{canManage ? (
				<View style={styles.actions}>
					<Pressable
						onPress={onResend}
						disabled={exhausted || resending}
						accessibilityRole="button"
						accessibilityLabel={
							exhausted ? t("team.resendExhausted") : t("team.resend")
						}
						style={[
							styles.actionBtn,
							{
								borderColor: c.border,
								opacity: exhausted || resending ? 0.5 : 1,
							},
						]}
					>
						{resending ? (
							<ActivityIndicator color={c.primary} size="small" />
						) : (
							<Text style={[styles.actionText, { color: c.primary }]}>
								{t("team.resend")}
							</Text>
						)}
					</Pressable>
					<Pressable
						onPress={onRevoke}
						disabled={revoking}
						accessibilityRole="button"
						accessibilityLabel={t("team.revoke")}
						style={[
							styles.actionBtn,
							{ borderColor: c.border, opacity: revoking ? 0.5 : 1 },
						]}
					>
						{revoking ? (
							<ActivityIndicator color={c.danger} size="small" />
						) : (
							<Text style={[styles.actionText, { color: c.danger }]}>
								{t("team.revoke")}
							</Text>
						)}
					</Pressable>
				</View>
			) : null}
			{exhausted ? (
				<Text style={[styles.exhausted, { color: c.warningText }]}>
					{t("team.resendExhausted")}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		minHeight: 44,
		padding: 12,
		borderRadius: 14,
		borderWidth: 1,
		gap: 8,
	},
	body: { gap: 2 },
	target: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	actions: { flexDirection: "row", gap: 8 },
	actionBtn: {
		minHeight: 36,
		minWidth: 44,
		paddingHorizontal: 12,
		borderRadius: 10,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	actionText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	exhausted: { fontSize: 11, fontFamily: Fonts.body },
});
