import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
	ActivityIndicator,
	Pressable,
	type StyleProp,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTranslation } from "@/src/lib/i18n";
import type { PendingPhoto } from "@/src/lib/photoQueue";

/**
 * A photo still on its way: the local picture at once, a spinner while it
 * uploads, and on failure the reason with a tap to retry.
 */
export function PendingPhotoTile({
	photo,
	onRetry,
	onRemove,
	style,
}: {
	photo: PendingPhoto;
	onRetry: () => void;
	onRemove: () => void;
	style: StyleProp<ViewStyle>;
}) {
	const { t } = useTranslation();
	const failed = photo.status === "failed";
	return (
		<View style={[styles.tile, style]}>
			<Image
				source={{ uri: photo.uri }}
				style={StyleSheet.absoluteFill}
				contentFit="cover"
				accessibilityIgnoresInvertColors
			/>
			<Pressable
				onPress={failed ? onRetry : undefined}
				disabled={!failed}
				accessibilityRole={failed ? "button" : undefined}
				accessibilityLabel={
					failed
						? `${t("create.photoFailed")} ${photo.error ?? ""}`
						: t("create.photoUploading")
				}
				style={[styles.overlay, failed && styles.failed]}
			>
				{failed ? (
					<>
						<Ionicons name="refresh" size={20} color="#ffffff" />
						<Text style={styles.label} numberOfLines={2}>
							{t("common.retry")}
						</Text>
					</>
				) : (
					<ActivityIndicator color="#ffffff" />
				)}
			</Pressable>
			<Pressable
				onPress={onRemove}
				hitSlop={12}
				accessibilityRole="button"
				accessibilityLabel={t("create.removePhoto")}
				style={styles.remove}
			>
				<Ionicons name="close" size={16} color="#ffffff" />
			</Pressable>
		</View>
	);
}

/**
 * Why the photos that failed were not sent, one line per distinct reason,
 * under the grid: the tile itself only has room for "Réessayer", and a seller
 * needs the reason to know whether retrying will help.
 */
export function PendingPhotoErrors({ photos }: { photos: PendingPhoto[] }) {
	const { t } = useTranslation();
	const C = Colors[useColorScheme() === "dark" ? "dark" : "light"];
	const reasons = [
		...new Set(
			photos
				.filter((photo) => photo.status === "failed")
				.map((photo) => photo.error ?? t("create.uploadErrorMsg")),
		),
	];
	if (reasons.length === 0) return null;
	return (
		<View style={styles.errors} accessibilityLiveRegion="polite">
			{reasons.map((reason) => (
				<View key={reason} style={styles.errorRow}>
					<Ionicons
						name="alert-circle"
						size={14}
						color={C.dangerText}
						importantForAccessibility="no"
					/>
					<Text style={[styles.errorText, { color: C.dangerText }]}>
						{t("create.photoFailed")} {reason}
					</Text>
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	errors: { gap: 4, marginTop: 8 },
	errorRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
	errorText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	// Clips the picture and its veil to whatever radius the caller gives.
	tile: { overflow: "hidden" },
	overlay: {
		position: "absolute",
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
		padding: 6,
		backgroundColor: "rgba(18, 22, 58, 0.45)",
	},
	// The danger ink (#8e2219) under white words: 8:1 even over a bright photo.
	failed: { backgroundColor: "rgba(142, 34, 25, 0.82)" },
	label: {
		color: "#ffffff",
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		textAlign: "center",
	},
	remove: {
		position: "absolute",
		top: 6,
		right: 6,
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: "rgba(18, 22, 58, 0.7)",
		alignItems: "center",
		justifyContent: "center",
	},
});
