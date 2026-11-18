import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import type { User } from "@/src/lib/auth";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";
import { useGroupedColors } from "./Grouped";

/**
 * The signed-in person's picture, drawn the same way wherever it appears
 * (the Account header, Edit profile): a rounded square cut at 22/72 of its
 * side, the thumbnail variant over metered data, and the initial in white
 * on the brand fill when there is no photo.
 */
export function UserAvatar({
	user,
	size = 72,
	uri,
}: {
	user: Pick<User, "name" | "avatar"> | null | undefined;
	size?: number;
	/** A local picture shown before the upload round-trip finishes. */
	uri?: string | null;
}) {
	const c = useGroupedColors();
	const radius = Math.round((size * 22) / 72);
	const source =
		uri ??
		(user?.avatar?.url
			? (resolveListingImageUrl(user.avatar, "thumbnail") ?? user.avatar.url)
			: null);
	const box = { width: size, height: size, borderRadius: radius };

	if (source) {
		return (
			<Image
				source={{ uri: source }}
				style={box}
				contentFit="cover"
				accessibilityIgnoresInvertColors
			/>
		);
	}
	return (
		<View
			style={[styles.placeholder, box, { backgroundColor: c.primaryFill }]}
			importantForAccessibility="no-hide-descendants"
			accessibilityElementsHidden
		>
			<Text style={[styles.letter, { fontSize: Math.round(size * 0.39) }]}>
				{user?.name?.trim()?.[0]?.toUpperCase() ?? "?"}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	placeholder: { alignItems: "center", justifyContent: "center" },
	letter: { fontFamily: Fonts.displayBold, color: "#ffffff" },
});
