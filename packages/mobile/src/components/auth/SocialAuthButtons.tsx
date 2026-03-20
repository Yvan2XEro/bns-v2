import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { AnimatedPressable } from "@/src/components/AnimatedPressable";
import type { SocialAuthProvider } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";

const providers: Array<{ labelKey: string; value: SocialAuthProvider }> = [
	{ labelKey: "auth.continueWithGoogle", value: "google" },
	{ labelKey: "auth.continueWithApple", value: "apple" },
	{ labelKey: "auth.continueWithFacebook", value: "facebook" },
];

export function SocialAuthButtons({
	borderColor,
	mutedColor,
	onPress,
	primaryColor,
}: {
	borderColor: string;
	mutedColor: string;
	onPress: (provider: SocialAuthProvider) => void;
	primaryColor: string;
}) {
	const { t } = useTranslation();

	return (
		<View style={styles.container}>
			<View style={styles.dividerRow}>
				<View style={[styles.divider, { backgroundColor: borderColor }]} />
				<Text style={[styles.dividerText, { color: mutedColor }]}>
					{t("auth.orContinueWith")}
				</Text>
				<View style={[styles.divider, { backgroundColor: borderColor }]} />
			</View>

			<View style={styles.buttons}>
				{providers.map((provider) => (
					<AnimatedPressable
						key={provider.value}
						onPress={() => onPress(provider.value)}
						scaleTo={0.98}
						style={[
							styles.button,
							{
								borderColor,
								backgroundColor: "transparent",
							},
						]}
					>
						<Text style={[styles.buttonText, { color: primaryColor }]}>
							{t(provider.labelKey)}
						</Text>
					</AnimatedPressable>
				))}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	button: {
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1,
		minHeight: 48,
		justifyContent: "center",
		paddingHorizontal: 14,
	},
	buttonText: {
		fontFamily: Fonts.bodySemibold,
		fontSize: 14,
	},
	buttons: {
		gap: 10,
	},
	container: {
		gap: 12,
	},
	divider: {
		flex: 1,
		height: 1,
	},
	dividerRow: {
		alignItems: "center",
		flexDirection: "row",
		gap: 12,
	},
	dividerText: {
		fontFamily: Fonts.bodySemibold,
		fontSize: 12,
		textTransform: "uppercase",
	},
});
