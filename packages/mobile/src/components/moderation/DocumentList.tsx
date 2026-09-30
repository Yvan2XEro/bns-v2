import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useDocumentUrl } from "@/src/hooks/useModerationVerification";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { ModerationVerificationDetail } from "@/src/types/api";
import { useModerationTheme } from "./theme";

type DocumentMeta =
	ModerationVerificationDetail["request"]["documents"][number];

/**
 * Every open is a logged view of a real person's identity papers: a signed
 * URL is requested only when the reviewer explicitly taps "View document",
 * never prefetched for the list and never cached past the 60 seconds the
 * server grants it. A PDF cannot render inline on native, so it opens in the
 * system browser instead of an image; an image renders with
 * `cachePolicy="none"` so it never outlives the URL on this device.
 */
export function DocumentList({ documents }: { documents: DocumentMeta[] }) {
	const c = useModerationTheme();
	const { t } = useTranslation();
	const [activeId, setActiveId] = useState<string | null>(
		documents[0]?.id ?? null,
	);
	const documentUrl = useDocumentUrl();
	const active = documents.find((doc) => doc.id === activeId) ?? null;

	function selectDocument(id: string) {
		documentUrl.reset();
		setActiveId(id);
	}

	function view() {
		if (!active) return;
		documentUrl.mutate(active.id, {
			onSuccess: (result) => {
				if (!result.mimeType.startsWith("image/")) {
					void WebBrowser.openBrowserAsync(result.url);
				}
			},
		});
	}

	if (documents.length === 0) return null;

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.title, { color: c.text }]}>
				{t("moderation.verifDocumentsTitle")}
			</Text>

			<ScrollView horizontal showsHorizontalScrollIndicator={false}>
				<View style={styles.chips}>
					{documents.map((doc) => {
						const selected = doc.id === activeId;
						const label = doc.kind
							? t(`moderation.verifDocumentKind_${doc.kind}`)
							: t("moderation.verifDocumentUnknownKind");
						return (
							<Pressable
								key={doc.id}
								accessibilityRole="button"
								accessibilityLabel={label}
								accessibilityState={{ selected }}
								onPress={() => selectDocument(doc.id)}
								style={[
									styles.chip,
									{
										backgroundColor: selected ? c.primary : "transparent",
										borderColor: selected ? c.primary : c.border,
									},
								]}
							>
								<Text
									style={[
										styles.chipText,
										{ color: selected ? "#fff" : c.text },
									]}
								>
									{label}
								</Text>
							</Pressable>
						);
					})}
				</View>
			</ScrollView>

			{active?.purgedAt ? (
				<Text
					style={[styles.purged, { color: c.muted, backgroundColor: c.bg }]}
				>
					{t("moderation.verifDocumentPurged")}
				</Text>
			) : null}

			{active && !active.purgedAt && !documentUrl.data ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("moderation.verifDocumentView")}
					disabled={documentUrl.isPending}
					onPress={view}
					style={[styles.viewBtn, { backgroundColor: c.primary }]}
				>
					{documentUrl.isPending ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.viewBtnText}>
							{t("moderation.verifDocumentView")}
						</Text>
					)}
				</Pressable>
			) : null}

			{documentUrl.isError ? (
				<Text
					accessibilityRole="alert"
					style={[
						styles.error,
						{ color: c.danger, backgroundColor: c.dangerSoft },
					]}
				>
					{resolveErrorMessage(
						documentUrl.error,
						t,
						t("moderation.verifDocumentViewFailed"),
					)}
				</Text>
			) : null}

			{documentUrl.data &&
			active &&
			documentUrl.data.mimeType.startsWith("image/") ? (
				<Image
					source={{ uri: documentUrl.data.url }}
					cachePolicy="none"
					style={styles.preview}
					contentFit="contain"
					accessibilityLabel={
						active.kind
							? t(`moderation.verifDocumentKind_${active.kind}`)
							: t("moderation.verifDocumentUnknownKind")
					}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 12,
	},
	title: { fontSize: 15, fontFamily: Fonts.displayBold },
	chips: { flexDirection: "row", gap: 8 },
	chip: {
		borderRadius: 999,
		borderWidth: 1.5,
		paddingHorizontal: 14,
		minHeight: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	chipText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	purged: {
		fontSize: 13,
		fontFamily: Fonts.body,
		borderRadius: 10,
		padding: 10,
	},
	viewBtn: {
		minHeight: 44,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	viewBtnText: { fontSize: 14, fontFamily: Fonts.bodySemibold, color: "#fff" },
	error: {
		fontSize: 13,
		fontFamily: Fonts.body,
		borderRadius: 10,
		padding: 10,
	},
	preview: { width: "100%", height: 320, borderRadius: 12 },
});
