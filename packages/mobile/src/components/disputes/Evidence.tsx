import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import {
	ActivityIndicator,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	evidenceUrlQuery,
	useDisputeEvidenceUrl,
} from "@/src/hooks/useDisputes";
import type { EvidenceAttachment } from "@/src/lib/disputeEvidence";
import { useTranslation } from "@/src/lib/i18n";

const SIZE = 48;

function KindIcon({
	kind,
	color,
}: {
	kind: EvidenceAttachment["kind"];
	color: string;
}) {
	return (
		<Ionicons
			name={kind === "video" ? "videocam-outline" : "document-outline"}
			size={22}
			color={color}
		/>
	);
}

/** An image loads its signed URL; any other file shows its kind until opened. */
export function EvidenceThumb({
	disputeId,
	attachment,
	onOpen,
}: {
	disputeId: string;
	attachment: EvidenceAttachment;
	onOpen: (attachment: EvidenceAttachment) => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const image = attachment.kind === "image";
	const signed = useDisputeEvidenceUrl(disputeId, attachment.id, image);
	return (
		<Pressable
			onPress={() => onOpen(attachment)}
			accessibilityRole="button"
			accessibilityLabel={t(`disputes.openEvidence_${attachment.kind}`)}
			hitSlop={4}
			style={[
				styles.thumb,
				{ backgroundColor: c.neutralSoft, borderColor: c.border },
			]}
		>
			{!image ? (
				<KindIcon kind={attachment.kind} color={c.neutralText} />
			) : signed.data ? (
				<Image
					source={{ uri: signed.data.url }}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
				/>
			) : signed.isError ? (
				<Ionicons name="image-outline" size={20} color={c.muted} />
			) : (
				<ActivityIndicator size="small" color={c.muted} />
			)}
		</Pressable>
	);
}

export function EvidenceStrip({
	disputeId,
	attachments,
	onOpen,
}: {
	disputeId: string;
	attachments: readonly EvidenceAttachment[];
	onOpen: (attachment: EvidenceAttachment) => void;
}) {
	if (attachments.length === 0) return null;
	return (
		<View style={styles.strip}>
			{attachments.map((attachment) => (
				<EvidenceThumb
					key={attachment.id}
					disputeId={disputeId}
					attachment={attachment}
					onOpen={onOpen}
				/>
			))}
		</View>
	);
}

/**
 * Opening a non-image hands its signed URL to the system browser, which
 * plays a video or renders a PDF; images open in `EvidenceViewer`.
 */
export function useOpenEvidenceFile(disputeId: string) {
	const queryClient = useQueryClient();
	return async (attachment: EvidenceAttachment) => {
		const signed = await queryClient.fetchQuery(
			evidenceUrlQuery(disputeId, attachment.id),
		);
		await WebBrowser.openBrowserAsync(signed.url);
	};
}

export function EvidenceViewer({
	disputeId,
	attachment,
	onClose,
}: {
	disputeId: string;
	attachment: EvidenceAttachment | null;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const signed = useDisputeEvidenceUrl(
		disputeId,
		attachment?.id ?? "",
		attachment?.kind === "image",
	);
	return (
		<Modal
			visible={attachment !== null}
			animationType="fade"
			onRequestClose={onClose}
			transparent
		>
			<SafeAreaView style={styles.viewer}>
				<View style={styles.viewerBar}>
					<Pressable
						onPress={onClose}
						accessibilityRole="button"
						accessibilityLabel={t("common.close")}
						hitSlop={8}
						style={styles.viewerClose}
					>
						<Ionicons name="close" size={26} color="#fff" />
					</Pressable>
				</View>
				<View style={styles.viewerBody}>
					{signed.data ? (
						<Image
							source={{ uri: signed.data.url }}
							style={styles.viewerImage}
							contentFit="contain"
							accessibilityLabel={t("disputes.openEvidence_image")}
						/>
					) : signed.isError ? (
						<Text style={styles.viewerError}>
							{t("disputes.evidenceUnavailable")}
						</Text>
					) : (
						<ActivityIndicator color="#fff" />
					)}
				</View>
			</SafeAreaView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	strip: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
	thumb: {
		width: SIZE,
		height: SIZE,
		borderRadius: 10,
		borderWidth: 1,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)" },
	viewerBar: { flexDirection: "row", justifyContent: "flex-end", padding: 8 },
	viewerClose: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	viewerBody: { flex: 1, alignItems: "center", justifyContent: "center" },
	viewerImage: { width: "100%", height: "100%" },
	viewerError: {
		color: "#fff",
		fontFamily: Fonts.body,
		fontSize: 14,
		textAlign: "center",
		paddingHorizontal: 24,
	},
});
