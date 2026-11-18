import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useDocumentUrl } from "@/src/hooks/useModerationVerification";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { ModerationVerificationDetail } from "@/src/types/api";
import { DecisionButton, InlineNotice, ModerationCard } from "./ModerationKit";
import { useModerationTheme } from "./theme";
import { tonesOf } from "./tones";

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
	const k = tonesOf(c);
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
		<ModerationCard title={t("moderation.verifDocumentsTitle")}>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				accessibilityRole="tablist"
			>
				<View style={styles.chips}>
					{documents.map((doc) => {
						const selected = doc.id === activeId;
						const label = doc.kind
							? t(`moderation.verifDocumentKind_${doc.kind}`)
							: t("moderation.verifDocumentUnknownKind");
						return (
							<Pressable
								key={doc.id}
								accessibilityRole="tab"
								accessibilityLabel={label}
								accessibilityState={{ selected }}
								onPress={() => selectDocument(doc.id)}
								style={[
									styles.chip,
									{
										backgroundColor: selected ? k.selectedSoft : c.card,
										borderColor: selected ? k.linkText : c.border,
									},
								]}
							>
								<Text
									style={[
										styles.chipText,
										{
											color: selected ? k.linkText : c.text,
											fontFamily: selected
												? Fonts.bodyBold
												: Fonts.bodySemibold,
										},
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
				<InlineNotice
					tone="neutral"
					text={t("moderation.verifDocumentPurged")}
				/>
			) : null}

			{active && !active.purgedAt && !documentUrl.data ? (
				// Every open is logged, so it is an explicit, labelled tap.
				<DecisionButton
					variant="secondary"
					icon="eye-outline"
					label={t("moderation.verifDocumentView")}
					onPress={view}
					pending={documentUrl.isPending}
					grow={0}
				/>
			) : null}

			{documentUrl.isError ? (
				<InlineNotice
					text={resolveErrorMessage(
						documentUrl.error,
						t,
						t("moderation.verifDocumentViewFailed"),
					)}
				/>
			) : null}

			{documentUrl.data &&
			active &&
			documentUrl.data.mimeType.startsWith("image/") ? (
				<Image
					source={{ uri: documentUrl.data.url }}
					cachePolicy="none"
					style={[styles.preview, { backgroundColor: c.bg }]}
					contentFit="contain"
					accessibilityLabel={
						active.kind
							? t(`moderation.verifDocumentKind_${active.kind}`)
							: t("moderation.verifDocumentUnknownKind")
					}
				/>
			) : null}
		</ModerationCard>
	);
}

const styles = StyleSheet.create({
	chips: { flexDirection: "row", gap: 8 },
	chip: {
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 14,
		minHeight: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	chipText: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 22 },
	preview: { width: "100%", height: 360, borderRadius: 12 },
});
