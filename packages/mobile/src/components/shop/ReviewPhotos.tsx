import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import { useShopTheme } from "./theme";

export interface ReviewPhoto {
	id: string;
	url: string;
}

/** Thumbnails under a review; a tap opens the review's photos full screen. */
export function ReviewPhotos({ photos }: { photos: ReviewPhoto[] }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const [open, setOpen] = useState<number | null>(null);
	const count = photos.length;
	if (count === 0) return null;
	const current = open === null ? null : photos[open];
	const step = (delta: number) =>
		setOpen((index) =>
			index === null ? null : (index + delta + count) % count,
		);

	return (
		<>
			<View style={styles.row} accessibilityLabel={t("shop.reviewPhotosLabel")}>
				{photos.map((photo, index) => (
					<Pressable
						key={photo.id}
						onPress={() => setOpen(index)}
						accessibilityRole="imagebutton"
						accessibilityLabel={t("shop.openPhoto", {
							index: index + 1,
							count,
						})}
					>
						<Image
							source={{ uri: resolveImageUrl(photo.url) ?? undefined }}
							style={[styles.thumb, { backgroundColor: c.input }]}
							contentFit="cover"
						/>
					</Pressable>
				))}
			</View>
			<Modal
				visible={current !== null}
				transparent
				animationType="fade"
				onRequestClose={() => setOpen(null)}
			>
				<View style={styles.viewer}>
					{current ? (
						<Image
							source={{ uri: resolveImageUrl(current.url) ?? undefined }}
							style={StyleSheet.absoluteFill}
							contentFit="contain"
							accessibilityLabel={t("shop.photoViewer", {
								index: (open ?? 0) + 1,
								count,
							})}
						/>
					) : null}
					<Pressable
						onPress={() => setOpen(null)}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel={t("shop.closePhoto")}
						style={[styles.close, { top: insets.top + 12 }]}
					>
						<Ionicons name="close" size={22} color="#fff" />
					</Pressable>
					{count > 1 ? (
						<View style={[styles.nav, { bottom: insets.bottom + 24 }]}>
							<Pressable
								onPress={() => step(-1)}
								hitSlop={8}
								accessibilityRole="button"
								accessibilityLabel={t("shop.previousPhoto")}
								style={styles.navBtn}
							>
								<Ionicons name="chevron-back" size={22} color="#fff" />
							</Pressable>
							<Text style={styles.counter}>
								{(open ?? 0) + 1} / {count}
							</Text>
							<Pressable
								onPress={() => step(1)}
								hitSlop={8}
								accessibilityRole="button"
								accessibilityLabel={t("shop.nextPhoto")}
								style={styles.navBtn}
							>
								<Ionicons name="chevron-forward" size={22} color="#fff" />
							</Pressable>
						</View>
					) : null}
				</View>
			</Modal>
		</>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
	thumb: { width: 64, height: 64, borderRadius: 10 },
	viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)" },
	close: {
		position: "absolute",
		right: 16,
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.15)",
	},
	nav: {
		position: "absolute",
		left: 0,
		right: 0,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 24,
	},
	navBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.15)",
	},
	counter: { color: "#fff", fontSize: 14, fontFamily: Fonts.bodySemibold },
});
