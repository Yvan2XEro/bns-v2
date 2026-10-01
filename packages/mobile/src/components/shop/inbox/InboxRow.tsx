import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { relativeAge } from "@/src/lib/moderationVerification";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import type { InboxConversationView } from "@/src/types/api";
import { useShopTheme } from "../theme";

function relativeLabel(
	t: (key: string, options?: Record<string, unknown>) => string,
	at: string,
): string {
	const age = relativeAge(at);
	if (!age) return "";
	if (age.unit === "minutes" && age.count === 0) return t("time.justNow");
	return t(`time.${age.unit}Ago`, { count: age.count });
}

/** One row of the shared shop inbox. Purely presentational: filtering, paging and navigation live in the screen. */
export function InboxRow({
	item,
	onPress,
}: {
	item: InboxConversationView;
	onPress: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const buyerName = item.buyer?.name ?? t("inbox.unknownBuyer");
	const buyerUri = resolveImageUrl(item.buyer?.avatarUrl ?? null);
	const listingUri = resolveImageUrl(item.listing?.thumbnailUrl ?? null);
	const unread = item.unreadCount > 0;

	return (
		<Pressable
			onPress={onPress}
			style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
			accessibilityRole="button"
			accessibilityLabel={buyerName}
		>
			<View style={styles.avatarWrap}>
				{buyerUri ? (
					<Image
						source={{ uri: buyerUri }}
						style={styles.avatar}
						contentFit="cover"
					/>
				) : (
					<View
						style={[styles.avatarFallback, { backgroundColor: c.primarySoft }]}
					>
						<Text style={{ color: c.primary, fontFamily: Fonts.displayBold }}>
							{buyerName[0]?.toUpperCase() ?? "?"}
						</Text>
					</View>
				)}
				{unread ? (
					<View style={[styles.unreadDot, { backgroundColor: c.sell }]} />
				) : null}
			</View>

			<View style={{ flex: 1 }}>
				<View style={styles.topLine}>
					<Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
						{buyerName}
					</Text>
					{item.lastMessage ? (
						<Text style={[styles.time, { color: c.muted }]}>
							{relativeLabel(t, item.lastMessage.at)}
						</Text>
					) : null}
				</View>
				{item.listing ? (
					<Text style={[styles.listing, { color: c.muted }]} numberOfLines={1}>
						{item.listing.title}
					</Text>
				) : null}
				<Text
					style={[
						styles.preview,
						{
							color: unread ? c.text : c.muted,
							fontFamily: unread ? Fonts.bodySemibold : Fonts.body,
						},
					]}
					numberOfLines={1}
				>
					{item.lastMessage?.preview ?? t("inbox.noMessages")}
				</Text>
				{item.assignee ? (
					<Text
						style={[
							styles.assignee,
							{ color: item.assignee.suspended ? c.dangerText : c.muted },
						]}
						numberOfLines={1}
					>
						{item.assignee.suspended
							? t("inbox.assignedSuspended", {
									name: item.assignee.name ?? t("inbox.unknownMember"),
								})
							: t("inbox.assignedTo", {
									name: item.assignee.name ?? t("inbox.unknownMember"),
								})}
					</Text>
				) : (
					<Text style={[styles.assignee, { color: c.muted }]}>
						{t("inbox.unassigned")}
					</Text>
				)}
			</View>

			{listingUri ? (
				<Image
					source={{ uri: listingUri }}
					style={styles.thumb}
					contentFit="cover"
				/>
			) : (
				<View
					style={[
						styles.thumb,
						styles.thumbFallback,
						{ backgroundColor: c.neutralSoft },
					]}
				>
					<Ionicons name="pricetag-outline" size={16} color={c.muted} />
				</View>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	avatarWrap: { position: "relative" },
	avatar: { width: 44, height: 44, borderRadius: 22 },
	avatarFallback: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	unreadDot: {
		position: "absolute",
		top: -2,
		right: -2,
		width: 12,
		height: 12,
		borderRadius: 6,
		borderWidth: 2,
		borderColor: "#fff",
	},
	topLine: { flexDirection: "row", alignItems: "center", gap: 6 },
	name: { flex: 1, fontSize: 15, fontFamily: Fonts.displayBold },
	time: { fontSize: 11, fontFamily: Fonts.body },
	listing: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
	preview: { fontSize: 13, marginTop: 2 },
	assignee: { fontSize: 11, fontFamily: Fonts.body, marginTop: 3 },
	thumb: { width: 44, height: 44, borderRadius: 8 },
	thumbFallback: { alignItems: "center", justifyContent: "center" },
});
