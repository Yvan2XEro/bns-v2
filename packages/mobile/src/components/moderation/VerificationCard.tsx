import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import {
	moderationVerificationKeys,
	useVerificationDecision,
} from "@/src/hooks/useModerationVerification";
import { useTranslation } from "@/src/lib/i18n";
import { capitalize, relativeAge } from "@/src/lib/moderationVerification";
import { badgeForLevel, statusToneKey } from "@/src/lib/verification";
import type { ModerationVerificationQueueItem } from "@/src/types/api";
import { SignalChip } from "./SignalsPanel";
import { useModerationTheme } from "./theme";

const TONE_COLOR_KEY = {
	positive: "success",
	negative: "danger",
	warning: "warning",
	neutral: "muted",
} as const;

/**
 * One request in the "to review" queue. Claiming is attempted, never
 * precomputed: the button shows whenever the row is unclaimed and submitted,
 * and the server's response — success, or a lost-race 409 — decides the
 * outcome. On failure the queue is invalidated so the row reflects reality
 * rather than a client guess about who holds it.
 */
export function VerificationCard({
	item,
}: {
	item: ModerationVerificationQueueItem;
}) {
	const c = useModerationTheme();
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const claim = useVerificationDecision();

	const age = relativeAge(item.submittedAt);
	const claimable = item.status === "submitted" && !item.assignee;
	const tone = statusToneKey(item.status);

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={t("moderation.verifRowShop", {
				id: item.shopId ?? item.id,
			})}
			onPress={() =>
				router.push(`/moderation/verification/${item.id}` as never)
			}
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.header}>
				<Text style={[styles.shop, { color: c.primary }]} numberOfLines={1}>
					{t("moderation.verifRowShop", { id: item.shopId ?? item.id })}
				</Text>
				<Ionicons name="chevron-forward" size={18} color={c.muted} />
			</View>

			<View style={styles.meta}>
				<LevelBadge badge={badgeForLevel(item.requestedLevel)} size="sm" />
				<Text style={[styles.status, { color: c[TONE_COLOR_KEY[tone]] }]}>
					{t(`moderation.verifStatus_${item.status}`)}
				</Text>
				{age ? (
					<Text style={[styles.age, { color: c.muted }]}>
						{t(`moderation.age${capitalize(age.unit)}`, { count: age.count })}
					</Text>
				) : null}
			</View>

			{item.signals.length > 0 ? (
				<View style={styles.signals}>
					{item.signals.map((code) => (
						<SignalChip key={code} code={code} />
					))}
				</View>
			) : null}

			{claimable ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("moderation.verifRowClaim")}
					disabled={claim.isPending}
					onPress={(event) => {
						event.stopPropagation?.();
						claim.mutate(
							{ id: item.id, action: "claim" },
							{
								onError: () => {
									queryClient.invalidateQueries({
										queryKey: moderationVerificationKeys.root,
									});
								},
							},
						);
					}}
					style={[styles.claimBtn, { backgroundColor: c.primary }]}
				>
					{claim.isPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.claimText}>
							{t("moderation.verifRowClaim")}
						</Text>
					)}
				</Pressable>
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 10,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	shop: { fontSize: 15, fontFamily: Fonts.bodySemibold, flexShrink: 1 },
	meta: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
	status: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	age: { fontSize: 12, fontFamily: Fonts.body },
	signals: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
	claimBtn: {
		alignSelf: "flex-start",
		minHeight: 44,
		paddingHorizontal: 16,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	claimText: { fontSize: 13, fontFamily: Fonts.bodySemibold, color: "#fff" },
});
