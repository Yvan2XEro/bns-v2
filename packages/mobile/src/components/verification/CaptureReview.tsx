import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { PickedFile } from "@/src/lib/verificationBusiness";

export interface CaptureReviewProps {
	visible: boolean;
	title: string;
	hint: string;
	pages: PickedFile[];
	canAddPage: boolean;
	/** The page the upload rules refused, with the message to show under it. */
	rejected: { index: number; message: string } | null;
	onAddPage: () => void;
	onRetake: (index: number) => void;
	onRemove: (index: number) => void;
	onCancel: () => void;
	onSend: () => void;
}

/** Every captured page, in order, before anything is uploaded. */
export function CaptureReview({
	visible,
	title,
	hint,
	pages,
	canAddPage,
	rejected,
	onAddPage,
	onRetake,
	onRemove,
	onCancel,
	onSend,
}: CaptureReviewProps) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const canSend = pages.length > 0 && !rejected;

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onCancel}
		>
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<View style={[styles.header, { borderColor: c.border }]}>
					<Pressable
						onPress={onCancel}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel={t("common.cancel")}
						style={styles.headerButton}
					>
						<Text style={[styles.cancel, { color: c.primary }]}>
							{t("common.cancel")}
						</Text>
					</Pressable>
					<Text
						style={[styles.title, { color: c.text }]}
						numberOfLines={1}
						accessibilityRole="header"
					>
						{title}
					</Text>
					<View style={styles.headerButton} />
				</View>

				<ScrollView contentContainerStyle={styles.scroll}>
					<Text style={[styles.hint, { color: c.muted }]}>{hint}</Text>

					{pages.map((page, index) => (
						<View
							key={`${page.uri}-${index}`}
							style={[
								styles.page,
								{
									backgroundColor: c.card,
									borderColor: rejected?.index === index ? c.danger : c.border,
								},
							]}
						>
							<Image
								source={{ uri: page.uri }}
								style={[styles.preview, { backgroundColor: c.neutralSoft }]}
								contentFit="contain"
								accessibilityLabel={t("verification.capture.pageOf", {
									index: index + 1,
									total: pages.length,
								})}
							/>
							<View style={styles.pageRow}>
								<Text style={[styles.pageLabel, { color: c.text }]}>
									{t("verification.capture.pageOf", {
										index: index + 1,
										total: pages.length,
									})}
								</Text>
								<Pressable
									onPress={() => onRetake(index)}
									hitSlop={6}
									accessibilityRole="button"
									accessibilityLabel={t("verification.capture.retake")}
									style={styles.pageAction}
								>
									<Ionicons
										name="camera-reverse-outline"
										size={16}
										color={c.primary}
									/>
									<Text style={[styles.pageActionText, { color: c.primary }]}>
										{t("verification.capture.retake")}
									</Text>
								</Pressable>
								<Pressable
									onPress={() => onRemove(index)}
									hitSlop={6}
									accessibilityRole="button"
									accessibilityLabel={t("verification.capture.remove")}
									style={styles.pageAction}
								>
									<Ionicons name="trash-outline" size={16} color={c.danger} />
									<Text style={[styles.pageActionText, { color: c.danger }]}>
										{t("verification.capture.remove")}
									</Text>
								</Pressable>
							</View>
							{rejected?.index === index ? (
								<Text role="alert" style={[styles.error, { color: c.danger }]}>
									{rejected.message}
								</Text>
							) : null}
						</View>
					))}

					{canAddPage ? (
						<Pressable
							onPress={onAddPage}
							accessibilityRole="button"
							accessibilityLabel={t("verification.capture.addPage")}
							style={[
								styles.addPage,
								{ borderColor: c.border, backgroundColor: c.input },
							]}
						>
							<Ionicons name="add" size={20} color={c.primary} />
							<Text style={[styles.addPageText, { color: c.primary }]}>
								{t("verification.capture.addPage")}
							</Text>
						</Pressable>
					) : null}
				</ScrollView>

				<View style={[styles.footer, { borderColor: c.border }]}>
					<Pressable
						onPress={onSend}
						disabled={!canSend}
						accessibilityRole="button"
						accessibilityLabel={t("verification.capture.send", {
							count: pages.length,
						})}
						style={[
							styles.send,
							{ backgroundColor: c.primary, opacity: canSend ? 1 : 0.5 },
						]}
					>
						<Text style={styles.sendText}>
							{t("verification.capture.send", { count: pages.length })}
						</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		minHeight: 52,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	headerButton: { minWidth: 72, minHeight: 44, justifyContent: "center" },
	cancel: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	title: {
		flex: 1,
		textAlign: "center",
		fontSize: 16,
		fontFamily: Fonts.displayBold,
	},
	scroll: { padding: 16, gap: 14, paddingBottom: 32 },
	hint: { fontSize: 13, fontFamily: Fonts.body },
	page: {
		borderRadius: 14,
		borderWidth: 1,
		padding: 10,
		gap: 8,
	},
	preview: { width: "100%", aspectRatio: 3 / 4, borderRadius: 10 },
	pageRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	pageLabel: { flex: 1, fontSize: 14, fontFamily: Fonts.bodySemibold },
	pageAction: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		minHeight: 44,
		paddingHorizontal: 6,
	},
	pageActionText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	error: { fontSize: 12, fontFamily: Fonts.body },
	addPage: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		minHeight: 56,
		borderRadius: 12,
		borderWidth: 1,
		borderStyle: "dashed",
	},
	addPageText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
	send: {
		height: 54,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	sendText: { color: "#fff", fontSize: 16, fontFamily: Fonts.displayBold },
});
