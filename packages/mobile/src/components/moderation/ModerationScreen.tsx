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
					<Text
						accessibilityRole="header"
						style={[styles.title, { color: c.text }]}
						numberOfLines={1}
					>
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
		gap: 6,
		minHeight: 60,
		paddingHorizontal: 8,
		paddingVertical: 8,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	backBtn: {
		width: 48,
		height: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	headerText: { flex: 1 },
	// The bar title every shell shares: Poppins Bold 18/23.
	title: {
		fontSize: 18,
		lineHeight: 26,
		letterSpacing: -0.2,
		fontFamily: Fonts.displayBold,
	},
	subtitle: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.body,
		marginTop: 1,
	},
});
