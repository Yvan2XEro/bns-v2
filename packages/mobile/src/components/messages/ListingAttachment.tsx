import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import {
	resolveImageUrl,
	resolveListingImageUrl,
} from "@/src/lib/resolveImageUrl";

/** The listing a message points at, in the one shape both the composer and the thread draw. */
export interface AttachedListing {
	id: string;
	title: string;
	price?: number | null;
	thumbnailUrl?: string | null;
}

/**
 * Reads a listing off whatever carries it: the composer's own attachment
 * (already has `thumbnailUrl`), a listing doc from the API (`images[0]`),
 * or an unpopulated id, which has nothing to draw and returns null.
 */
export function attachedListingOf(raw: unknown): AttachedListing | null {
	if (!raw || typeof raw !== "object") return null;
	const doc = raw as {
		id?: unknown;
		title?: unknown;
		price?: unknown;
		thumbnailUrl?: unknown;
		images?: unknown[] | null;
	};
	if (typeof doc.id !== "string" || !doc.id) return null;
	const thumb =
		typeof doc.thumbnailUrl === "string" && doc.thumbnailUrl
			? resolveImageUrl(doc.thumbnailUrl)
			: resolveListingImageUrl(doc.images?.[0], "thumbnail");
	return {
		id: doc.id,
		title: typeof doc.title === "string" ? doc.title : "",
		price: typeof doc.price === "number" ? doc.price : null,
		thumbnailUrl: thumb,
	};
}

/** The signature price tag: ink on signage yellow, set in Outfit ExtraBold. */
function PriceTag({ price, small }: { price: number; small?: boolean }) {
	const isDark = useColorScheme() === "dark";
	const C = Colors[isDark ? "dark" : "light"];
	return (
		<View
			style={[
				styles.tag,
				small ? styles.tagSmall : null,
				{ backgroundColor: C.sun },
			]}
		>
			<Text
				style={[
					styles.tagText,
					small ? styles.tagTextSmall : null,
					{ color: C.sunForeground },
				]}
				numberOfLines={1}
			>
				{formatPrice(price, i18n.language)}
			</Text>
		</View>
	);
}

/** A listing shared inside a bubble: photo, title, price tag; opens the ad. */
export function MessageListingCard({
	listing,
	mine,
	onPress,
}: {
	listing: AttachedListing;
	mine: boolean;
	onPress: () => void;
}) {
	const isDark = useColorScheme() === "dark";
	const C = Colors[isDark ? "dark" : "light"];
	const { t } = useTranslation();
	const priceLabel =
		listing.price != null ? formatPrice(listing.price, i18n.language) : null;

	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="link"
			accessibilityLabel={[t("messages.viewListing"), listing.title, priceLabel]
				.filter(Boolean)
				.join(", ")}
			style={({ pressed }) => [
				styles.card,
				{
					backgroundColor: mine ? "rgba(255,255,255,0.12)" : C.well,
					opacity: pressed ? 0.85 : 1,
				},
			]}
		>
			{listing.thumbnailUrl ? (
				<Image
					source={{ uri: listing.thumbnailUrl }}
					style={[styles.cardImg, { backgroundColor: C.well }]}
					contentFit="cover"
					recyclingKey={listing.thumbnailUrl}
					accessible={false}
				/>
			) : null}
			<View style={styles.cardBody}>
				<View style={styles.cardInfo}>
					<Text
						style={[
							styles.cardTitle,
							{ color: mine ? "#ffffff" : C.foreground },
						]}
						numberOfLines={2}
					>
						{listing.title}
					</Text>
					{listing.price != null ? <PriceTag price={listing.price} /> : null}
				</View>
				<Ionicons
					name="chevron-forward"
					size={16}
					color={mine ? "rgba(255,255,255,0.8)" : C.mutedForeground}
				/>
			</View>
		</Pressable>
	);
}

/** The listing about to go out with the next message, above the composer. */
export function ComposerListingChip({
	listing,
	onRemove,
}: {
	listing: AttachedListing;
	onRemove: () => void;
}) {
	const isDark = useColorScheme() === "dark";
	const C = Colors[isDark ? "dark" : "light"];
	const { t } = useTranslation();

	return (
		<View
			style={[styles.chip, { backgroundColor: C.well, borderColor: C.border }]}
		>
			{listing.thumbnailUrl ? (
				<Image
					source={{ uri: listing.thumbnailUrl }}
					style={styles.chipImg}
					contentFit="cover"
					accessible={false}
				/>
			) : (
				<View
					style={[
						styles.chipImg,
						styles.chipImgFallback,
						{ backgroundColor: C.card },
					]}
				>
					<Ionicons
						name="pricetag-outline"
						size={18}
						color={C.mutedForeground}
					/>
				</View>
			)}
			<View style={styles.chipInfo}>
				<Text
					style={[styles.chipTitle, { color: C.foreground }]}
					numberOfLines={1}
				>
					{listing.title}
				</Text>
				{listing.price != null ? (
					<PriceTag price={listing.price} small />
				) : null}
			</View>
			<Pressable
				onPress={onRemove}
				accessibilityRole="button"
				accessibilityLabel={`${t("common.close")}, ${listing.title}`}
				hitSlop={4}
				style={({ pressed }) => [
					styles.chipRemove,
					{ opacity: pressed ? 0.6 : 1 },
				]}
			>
				<Ionicons name="close-circle" size={22} color={C.mutedForeground} />
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	tag: {
		alignSelf: "flex-start",
		borderRadius: 6,
		paddingHorizontal: 7,
		paddingVertical: 2,
	},
	tagSmall: { paddingHorizontal: 6, paddingVertical: 1 },
	tagText: {
		fontSize: 15,
		lineHeight: 19,
		letterSpacing: -0.2,
		fontFamily: Fonts.displayExtrabold,
	},
	tagTextSmall: { fontSize: 13, lineHeight: 17 },
	card: {
		borderRadius: 14,
		overflow: "hidden",
		marginBottom: 8,
	},
	cardImg: { width: "100%", aspectRatio: 16 / 10 },
	cardBody: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 10,
		paddingVertical: 10,
	},
	cardInfo: { flex: 1, gap: 6 },
	cardTitle: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.bodySemibold },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginHorizontal: 12,
		marginTop: 10,
		paddingLeft: 8,
		paddingVertical: 8,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
	},
	chipImg: { width: 44, height: 44, borderRadius: 8 },
	chipImgFallback: { alignItems: "center", justifyContent: "center" },
	chipInfo: { flex: 1, gap: 4 },
	chipTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	chipRemove: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
});
