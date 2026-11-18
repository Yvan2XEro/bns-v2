import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { shopApi } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { orderHelpActions, shopMessageTarget } from "@/src/lib/orderHelpBar";
import { useShopTheme } from "../shop/theme";

export function OrderHelpBar({
	canReportProblem,
	onReportProblem,
	shopId,
	conversationId,
}: {
	canReportProblem: boolean;
	onReportProblem: () => void;
	shopId: string | null | undefined;
	conversationId: string | null | undefined;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showError } = useAlert();
	const { bottom } = useSafeAreaInsets();
	const start = useMutation({
		mutationFn: (id: string) => shopApi.startShopConversation(id),
	});
	const actions = orderHelpActions({ canReportProblem, shopId });
	if (actions.length === 0) return null;

	const messageShop = () => {
		if (!shopId) return;
		const target = shopMessageTarget(conversationId, shopId);
		if (target.kind === "open") {
			router.push(`/messages/${target.conversationId}`);
			return;
		}
		start.mutate(target.shopId, {
			onSuccess: ({ conversationId: id }) => router.push(`/messages/${id}`),
			onError: (error) =>
				showError(t("common.error"), resolveErrorMessage(error, t)),
		});
	};

	return (
		<View
			style={[
				styles.bar,
				{
					backgroundColor: c.card,
					borderColor: c.border,
					paddingBottom: bottom + 12,
				},
			]}
		>
			{actions.includes("report_problem") ? (
				<Pressable
					accessibilityRole="button"
					onPress={onReportProblem}
					style={({ pressed }) => [
						styles.button,
						styles.outline,
						{
							borderColor: c.border,
							backgroundColor: c.card,
							opacity: pressed ? 0.85 : 1,
						},
					]}
				>
					<Ionicons name="warning-outline" size={18} color={c.text} />
					<Text style={[styles.text, { color: c.text }]} numberOfLines={2}>
						{t("purchases.helpProblem")}
					</Text>
				</Pressable>
			) : null}
			{actions.includes("message_shop") ? (
				<Pressable
					accessibilityRole="button"
					accessibilityState={{ busy: start.isPending }}
					disabled={start.isPending}
					onPress={messageShop}
					style={({ pressed }) => [
						styles.button,
						styles.outline,
						{
							borderColor: c.border,
							backgroundColor: c.card,
							opacity: pressed ? 0.85 : 1,
						},
					]}
				>
					{start.isPending ? (
						<ActivityIndicator color={c.text} />
					) : (
						<Ionicons name="chatbubble-outline" size={18} color={c.text} />
					)}
					<Text style={[styles.text, { color: c.text }]} numberOfLines={2}>
						{t("purchases.helpMessageShop")}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: "row",
		gap: 10,
		paddingHorizontal: 16,
		paddingTop: 12,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	button: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		minHeight: 52,
		borderRadius: 12,
		paddingHorizontal: 12,
	},
	outline: { borderWidth: 1 },
	// Two half-width buttons leave about 110pt for a label at 360dp, so a
	// long one wraps to a second line instead of losing its end.
	text: {
		fontSize: 15,
		lineHeight: 19,
		fontFamily: Fonts.bodyBold,
		flexShrink: 1,
		textAlign: "center",
	},
});
