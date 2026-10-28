import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { createCallable } from "react-call";
import {
	ActivityIndicator,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { alerts } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useTranslation } from "@/src/lib/i18n";
import {
	cardImageUrl,
	type ShareChannel,
	type ShareSubject,
	shareChannels,
} from "@/src/lib/shareTargets";
import { shareTo } from "@/src/lib/shareTo";

const ICONS: Record<
	ShareChannel,
	{ name: keyof typeof Ionicons.glyphMap; color: string }
> = {
	whatsappStatus: { name: "logo-whatsapp", color: "#25D366" },
	whatsappChat: { name: "chatbubble-ellipses", color: "#25D366" },
	instagramStory: { name: "logo-instagram", color: "#E1306C" },
	facebookStory: { name: "logo-facebook", color: "#1877F2" },
	copyLink: { name: "link", color: "#64748b" },
	more: { name: "share-outline", color: "#64748b" },
};

/**
 * Where a listing or a shop goes when it is shared: WhatsApp Status (the
 * story card, captioned with the link), a WhatsApp chat (the link, previewed
 * by its card), Instagram and Facebook stories (when the app has a Facebook
 * app id), the link copied, or any app. `await ShareSheet.call(subject)`
 * resolves once the sheet is closed. Mounted once, by the root layout.
 */
export const ShareSheet = createCallable<ShareSubject, void>(
	({ call, ...subject }) => {
		const c = useShopTheme();
		const insets = useSafeAreaInsets();
		const { t, i18n } = useTranslation();
		const { webUrl, facebookAppId } = useAppConfig();
		const [busy, setBusy] = useState<ShareChannel | null>(null);
		const lang = i18n.language.startsWith("en") ? "en" : "fr";
		const close = () => call.end();

		const run = async (channel: ShareChannel) => {
			if (!webUrl || busy) return;
			setBusy(channel);
			try {
				const outcome = await shareTo(channel, subject, {
					webUrl,
					lang,
					facebookAppId,
				});
				if (outcome === "cancelled") return;
				close();
				if (outcome === "copied") alerts.showSuccess(t("share.copied"));
				if (outcome === "notInstalled")
					alerts.showError(t("share.notInstalled"));
			} catch {
				close();
				alerts.showError(t("share.failed"));
			} finally {
				setBusy(null);
			}
		};

		return (
			<Modal
				visible={!call.ended}
				transparent
				animationType="slide"
				onRequestClose={close}
			>
				<Pressable
					style={styles.backdrop}
					onPress={close}
					accessibilityRole="button"
					accessibilityLabel={t("common.close")}
				/>
				<View
					style={[
						styles.sheet,
						{
							backgroundColor: c.card,
							paddingBottom: Math.max(insets.bottom, 16),
						},
					]}
				>
					<View style={[styles.handle, { backgroundColor: c.border }]} />
					<View style={styles.head}>
						{webUrl ? (
							<Image
								source={{
									uri: cardImageUrl(webUrl, subject, "story", lang),
								}}
								style={[styles.preview, { backgroundColor: c.input }]}
								contentFit="cover"
								transition={150}
								accessibilityIgnoresInvertColors
							/>
						) : null}
						<View style={styles.headText}>
							<Text style={[styles.title, { color: c.text }]}>
								{t("share.title")}
							</Text>
							<Text
								style={[styles.subtitle, { color: c.muted }]}
								numberOfLines={2}
							>
								{subject.title}
							</Text>
						</View>
					</View>
					{shareChannels(facebookAppId).map((channel) => (
						<Pressable
							key={channel}
							onPress={() => void run(channel)}
							disabled={busy !== null}
							style={({ pressed }) => [
								styles.row,
								{ borderColor: c.border, opacity: pressed ? 0.7 : 1 },
							]}
							accessibilityRole="button"
							accessibilityLabel={t(`share.${channel}`)}
						>
							<View
								style={[
									styles.icon,
									{ backgroundColor: `${ICONS[channel].color}1a` },
								]}
							>
								<Ionicons
									name={ICONS[channel].name}
									size={22}
									color={ICONS[channel].color}
								/>
							</View>
							<View style={styles.rowText}>
								<Text style={[styles.rowTitle, { color: c.text }]}>
									{t(`share.${channel}`)}
								</Text>
								<Text style={[styles.rowHint, { color: c.muted }]}>
									{t(`share.${channel}Hint`)}
								</Text>
							</View>
							{busy === channel ? (
								<ActivityIndicator color={c.primary} />
							) : null}
						</Pressable>
					))}
				</View>
			</Modal>
		);
	},
	300,
);

const styles = StyleSheet.create({
	backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)" },
	sheet: {
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingHorizontal: 16,
		paddingTop: 8,
		gap: 4,
	},
	handle: {
		alignSelf: "center",
		width: 40,
		height: 4,
		borderRadius: 2,
		marginBottom: 12,
	},
	head: {
		flexDirection: "row",
		gap: 14,
		alignItems: "center",
		marginBottom: 8,
	},
	preview: { width: 54, height: 96, borderRadius: 8 },
	headText: { flex: 1, gap: 2 },
	title: { fontFamily: Fonts.bodyBold, fontSize: 18 },
	subtitle: { fontFamily: Fonts.body, fontSize: 14 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	icon: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	rowText: { flex: 1, gap: 2 },
	rowTitle: { fontFamily: Fonts.bodySemibold, fontSize: 15 },
	rowHint: { fontFamily: Fonts.body, fontSize: 12 },
});
