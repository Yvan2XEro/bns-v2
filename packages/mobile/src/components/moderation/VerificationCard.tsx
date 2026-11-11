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
import { toneColors, tonesOf } from "./tones";

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
	const k = tonesOf(c);
	const status = toneColors(tone, c);
	const shopLabel = t("moderation.verifRowShop", {
		id: item.shopId ?? item.id,
	});

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${shopLabel}, ${t(`moderation.verifStatus_${item.status}`)}`}
			onPress={() =>
				router.push(`/moderation/verification/${item.id}` as never)
			}
			style={({ pressed }) => [
				styles.card,
				{
					backgroundColor: c.card,
					borderColor: c.border,
					opacity: pressed ? 0.85 : 1,
				},
			]}
		>
			<View style={styles.header}>
				<Text style={[styles.shop, { color: c.text }]} numberOfLines={1}>
					{shopLabel}
				</Text>
				<Ionicons name="chevron-forward" size={18} color={c.muted} />
			</View>

			<View style={styles.meta}>
				<LevelBadge badge={badgeForLevel(item.requestedLevel)} size="sm" />
				<View style={[styles.statusPill, { backgroundColor: status.soft }]}>
					<Text style={[styles.status, { color: status.text }]}>
						{t(`moderation.verifStatus_${item.status}`)}
					</Text>
				</View>
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
					style={({ pressed }) => [
						styles.claimBtn,
						{ backgroundColor: k.primaryFill, opacity: pressed ? 0.88 : 1 },
					]}
				>
					{claim.isPending ? (
						<ActivityIndicator color="#ffffff" />
					) : (
						<>
							<Ionicons name="hand-left-outline" size={18} color="#ffffff" />
							<Text style={styles.claimText}>
								{t("moderation.verifRowClaim")}
							</Text>
						</>
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
		gap: 8,
	},
	shop: {
		fontSize: 16,
		lineHeight: 21,
		fontFamily: Fonts.bodySemibold,
		flexShrink: 1,
	},
	meta: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
	statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
	status: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.bodySemibold },
	age: { fontSize: 13, fontFamily: Fonts.body },
	signals: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
	claimBtn: {
		alignSelf: "flex-start",
		flexDirection: "row",
		gap: 8,
		minHeight: 48,
		paddingHorizontal: 18,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	claimText: { fontSize: 15, fontFamily: Fonts.bodyBold, color: "#ffffff" },
});
