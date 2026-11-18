import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/src/components/EmptyState";
import { useTranslation } from "@/src/lib/i18n";
import { useShopTheme } from "../theme";
import { Header } from "./Header";

/**
 * Shown instead of the form when the flag is off: fails closed even on a
 * direct deep link. The shared empty state, with a way back, so the screen
 * is not a dead end.
 */
export function ShopsUnavailable({
	onClose,
	title,
}: {
	onClose: () => void;
	title: string;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
			<Header onClose={onClose} title={title} />
			<EmptyState
				illustration="sell"
				title={t("shop.unavailableTitle")}
				subtitle={t("apiErrors.shop.disabled")}
				ctaLabel={t("common.back")}
				onCta={onClose}
			/>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
});
