import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import { useIsModerator } from "@/src/hooks/useModeration";
import { useTranslation } from "@/src/lib/i18n";
import { useModerationTheme } from "./theme";

interface ModerationScreenProps {
	title: string;
	subtitle?: string;
	right?: ReactNode;
	children: ReactNode;
}

/**
 * Shell for every moderation screen. It also carries the client-side role
 * gate: the API refuses a non-moderator anyway, but a demoted account that
 * still has the route in its history must land on an explanation rather than
 * a screen full of failed requests.
 */
export function ModerationScreen({
	title,
	subtitle,
	right,
	children,
}: ModerationScreenProps) {
	const c = useModerationTheme();
	const { t } = useTranslation();
	const allowed = useIsModerator();

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<View style={[styles.header, { borderBottomColor: c.border }]}>
				<HeaderBackButton
					color={c.text}
					fallback="/(tabs)/account"
					style={styles.backBtn}
				/>
				<View style={styles.headerText}>
					<Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
						{title}
					</Text>
					{subtitle ? (
						<Text
							style={[styles.subtitle, { color: c.muted }]}
							numberOfLines={1}
						>
							{subtitle}
						</Text>
					) : null}
				</View>
				{right ?? <View style={styles.backBtn} />}
			</View>

			{allowed ? (
				children
			) : (
				<EmptyState
					illustration="empty"
					title={t("moderation.forbiddenTitle")}
					subtitle={t("moderation.forbiddenSubtitle")}
					ctaLabel={t("common.back")}
					onCta={() => router.replace("/(tabs)/account")}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingHorizontal: 12,
		paddingVertical: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	backBtn: {
		width: 36,
		height: 36,
		alignItems: "center",
		justifyContent: "center",
	},
	headerText: { flex: 1 },
	title: { fontSize: 17, fontFamily: Fonts.displayBold },
	subtitle: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
});
