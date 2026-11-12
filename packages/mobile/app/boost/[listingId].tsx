import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ShareSheet } from "@/src/components/share/ShareSheet";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useListing } from "@/src/hooks/useListings";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useTranslation } from "@/src/lib/i18n";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import type { ListingDoc } from "@/src/types/api";

// Deliberately no link out to the web listing page: that page renders the paid
// boost dialog, so sending the user there from inside the app is an App Review
// 3.1.1 external-purchase link-out for a digital in-app benefit. What it
// offers instead is free reach: sharing the listing where buyers already are.

export default function BoostModal() {
	const { listingId } = useLocalSearchParams<{ listingId: string }>();
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();
	// The listing the seller came to boost, named by its title and photo. A raw
	// id means nothing to them; until the listing loads (or if it fails) the
	// card simply goes without it.
	const { data } = useListing(listingId ?? "");
	const listing = ((data as { doc?: ListingDoc } | undefined)?.doc ?? data) as
		| ListingDoc
		| undefined;
	const listingTitle = listing?.title?.trim();
	const thumbnail = resolveListingImageUrl(listing?.images?.[0], "thumbnail");
	const { webUrl, shareCardsEnabled } = useAppConfig();

	const share = async () => {
		if (!listingId) return;
		if (shareCardsEnabled && webUrl && listingTitle) {
			await ShareSheet.call({
				kind: "listing",
				id: listingId,
				title: listingTitle,
			});
			return;
		}
		const url = `${(webUrl || "https://buynsellem.com").replace(/\/+$/, "")}/listing/${listingId}`;
		Share.share({
			title: listingTitle,
			url,
			message: listingTitle ? `${listingTitle}\n${url}` : url,
		});
	};

	const c = isDark ? Colors.dark : Colors.light;
	const bg = c.background;
	const cardBg = c.card;
	const textColor = c.foreground;
	const bodyColor = c.body;
	const borderColor = c.border;
	// White stays legible on the deeper indigo in dark mode.
	const filledColor = c.primaryFill;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.container, centeredContent]}>
				{/* The status first: boosting is not here yet. Then what the
				    seller can do today for the same listing. */}
				<View style={styles.header}>
					<View
						style={[styles.rocketIconWrap, { backgroundColor: c.sun }]}
						accessibilityElementsHidden
						importantForAccessibility="no-hide-descendants"
					>
						<Ionicons name="flash" size={36} color={c.sunForeground} />
					</View>
					<Text
						style={[styles.title, { color: textColor }]}
						accessibilityRole="header"
					>
						{t("boost.soonTitle")}
					</Text>
					<Text style={[styles.subtitle, { color: bodyColor }]}>
						{t("boost.soonBody")}
					</Text>
				</View>

				{listingTitle ? (
					<View
						style={[
							styles.listingCard,
							{ backgroundColor: cardBg, borderColor },
						]}
					>
						{thumbnail ? (
							<Image
								source={{ uri: thumbnail }}
								style={[styles.listingThumb, { backgroundColor: c.well }]}
								contentFit="cover"
								accessibilityIgnoresInvertColors
							/>
						) : null}
						<Text
							style={[styles.listingTitle, { color: textColor }]}
							numberOfLines={2}
						>
							{listingTitle}
						</Text>
					</View>
				) : null}

				<Text style={[styles.shareHint, { color: bodyColor }]}>
					{t("boost.shareHint")}
				</Text>

				<Pressable
					onPress={() => void share()}
					accessibilityRole="button"
					style={({ pressed }) => [
						styles.primaryAction,
						{ backgroundColor: filledColor, opacity: pressed ? 0.85 : 1 },
					]}
				>
					<Ionicons name="share-social-outline" size={19} color="#ffffff" />
					<Text style={styles.primaryActionText}>
						{t("boost.shareListing")}
					</Text>
				</Pressable>
				<Pressable
					onPress={() => router.dismiss()}
					accessibilityRole="button"
					style={({ pressed }) => [
						styles.secondaryAction,
						{
							borderColor: c.borderStrong,
							backgroundColor: pressed ? c.well : "transparent",
						},
					]}
				>
					<Text style={[styles.secondaryActionText, { color: textColor }]}>
						{t("common.close")}
					</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	container: {
		flex: 1,
		justifyContent: "center",
		padding: 24,
	},
	header: {
		alignItems: "center",
		marginBottom: 24,
	},
	// The signage plaque of the sell tab, squared, ink on yellow.
	rocketIconWrap: {
		alignItems: "center",
		borderRadius: 18,
		height: 72,
		justifyContent: "center",
		marginBottom: 18,
		width: 72,
	},
	title: {
		fontFamily: Fonts.displayExtrabold,
		fontSize: 24,
		lineHeight: 32,
		letterSpacing: -0.6,
		marginBottom: 8,
		textAlign: "center",
	},
	subtitle: {
		fontFamily: Fonts.body,
		fontSize: 15,
		lineHeight: 22,
		textAlign: "center",
	},
	listingCard: {
		alignItems: "center",
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		flexDirection: "row",
		gap: 12,
		padding: 14,
	},
	listingThumb: {
		borderRadius: 8,
		height: 48,
		width: 48,
	},
	listingTitle: {
		flex: 1,
		fontFamily: Fonts.bodySemibold,
		fontSize: 15,
		lineHeight: 20,
	},
	shareHint: {
		fontFamily: Fonts.body,
		fontSize: 15,
		lineHeight: 22,
		marginTop: 16,
	},
	primaryAction: {
		alignItems: "center",
		borderRadius: 12,
		flexDirection: "row",
		gap: 8,
		justifyContent: "center",
		marginTop: 20,
		minHeight: 52,
	},
	primaryActionText: {
		color: "#ffffff",
		fontFamily: Fonts.bodyBold,
		fontSize: 16,
		lineHeight: 22,
	},
	secondaryAction: {
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1.5,
		justifyContent: "center",
		marginTop: 10,
		minHeight: 52,
	},
	secondaryActionText: {
		fontFamily: Fonts.bodySemibold,
		fontSize: 16,
		lineHeight: 22,
	},
});
