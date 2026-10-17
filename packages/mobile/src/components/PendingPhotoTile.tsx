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
		<View style={style}>
			<Image
				source={{ uri: photo.uri }}
				style={StyleSheet.absoluteFill}
				contentFit="cover"
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
						<Ionicons name="refresh" size={20} color="#fff" />
						<Text style={styles.label} numberOfLines={2}>
							{t("create.photoRetry")}
						</Text>
					</>
				) : (
					<ActivityIndicator color="#fff" />
				)}
			</Pressable>
			<Pressable
				onPress={onRemove}
				hitSlop={10}
				accessibilityRole="button"
				accessibilityLabel={t("create.removePhoto")}
				style={styles.remove}
			>
				<Ionicons name="close" size={16} color="#fff" />
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
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
		backgroundColor: "rgba(15,23,42,0.45)",
		borderRadius: 12,
	},
	failed: { backgroundColor: "rgba(185,28,28,0.7)" },
	label: {
		color: "#fff",
		fontSize: 11,
		fontWeight: "600",
		textAlign: "center",
	},
	remove: {
		position: "absolute",
		top: 4,
		right: 4,
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: "rgba(15,23,42,0.7)",
		alignItems: "center",
		justifyContent: "center",
	},
});
