import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	type TextInputProps,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { FormField } from "@/src/components/settings/FormField";
import {
	GroupedRow,
	GroupedSection,
	useGroupedColors,
} from "@/src/components/settings/Grouped";
import { SettingsHeader } from "@/src/components/settings/SettingsHeader";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import { useAlert } from "@/src/contexts/AlertContext";
import { useCloseScreen } from "@/src/contexts/DetailPaneContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { useMyShop } from "@/src/hooks/useShops";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import i18n, { useTranslation } from "@/src/lib/i18n";
import { createMediaUploadFormData } from "@/src/lib/mediaUpload";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

function getErrorMessage(error: unknown, fallback: string): string {
	// `error instanceof Error` was always true for a failed request, so the
	// fallback never fired and users saw raw API text. resolveErrorMessage maps
	// the error code to translated copy and keeps the fallback for the rest.
	return resolveErrorMessage(error, (key) => i18n.t(key), fallback);
}

export function EditProfileScreen() {
	const { centeredContent } = useResponsive();
	const { user, refreshUser } = useAuth();
	const { showSuccess, showError, showAlert } = useAlert();
	const close = useCloseScreen("/(tabs)/account");
	const { t } = useTranslation();
	const { data: myShop } = useMyShop();
	const ownShop = myShop?.shop ?? null;

	const [name, setName] = useState(user?.name ?? "");
	const [bio, setBio] = useState(user?.bio ?? "");
	const [location, setLocation] = useState(user?.location ?? "");
	const [avatarUri, setAvatarUri] = useState<string | null>(null);
	const [avatarUploading, setAvatarUploading] = useState(false);

	const c = useGroupedColors();

	const pickAvatar = async (fromCamera: boolean) => {
		try {
			if (fromCamera) {
				const { status } = await ImagePicker.requestCameraPermissionsAsync();
				if (status !== "granted") {
					showError(
						t("profile.cameraPermissionDeniedTitle"),
						t("profile.cameraPermissionDeniedMessage"),
					);
					return;
				}
			} else {
				const { status } =
					await ImagePicker.requestMediaLibraryPermissionsAsync();
				if (status !== "granted") {
					showError(
						t("profile.galleryPermissionDeniedTitle"),
						t("profile.galleryPermissionDeniedMessage"),
					);
					return;
				}
			}
			const result = fromCamera
				? await ImagePicker.launchCameraAsync({
						allowsEditing: true,
						aspect: [1, 1],
						quality: 0.85,
					})
				: await ImagePicker.launchImageLibraryAsync({
						mediaTypes: ["images"],
						allowsEditing: true,
						aspect: [1, 1],
						quality: 0.85,
					});
			if (result.canceled || !result.assets?.[0]) return;
			const asset = result.assets[0];
			setAvatarUploading(true);
			const defaultBaseName = `avatar_${Date.now()}`;
			const formData = await createMediaUploadFormData(asset, {
				defaultBaseName,
				alt: asset.fileName ?? defaultBaseName,
			});
			const uploaded = await api.upload<{ doc: { id: string; url: string } }>(
				"/api/media",
				formData,
			);
			if (!uploaded?.doc?.id) throw new Error("Upload échoué");
			await api.patch(`/api/users/${user?.id}`, { avatar: uploaded.doc.id });
			setAvatarUri(asset.uri);
			await refreshUser();
			showSuccess(
				t("profile.uploadSuccessTitle"),
				t("profile.uploadSuccessMessage"),
			);
		} catch (err) {
			showError(
				t("auth.errorTitle"),
				getErrorMessage(err, t("profile.uploadFailedMessage")),
			);
		} finally {
			setAvatarUploading(false);
		}
	};

	const handlePickAvatar = () => {
		showAlert(t("profile.photoPickerTitle"), t("profile.photoPickerMessage"), [
			{ text: t("profile.takePhoto"), onPress: () => pickAvatar(true) },
			{ text: t("profile.gallery"), onPress: () => pickAvatar(false) },
			{ text: t("common.cancel"), style: "cancel" },
		]);
	};

	const { mutate: save, isPending } = useMutation({
		mutationFn: () =>
			api.patch(`/api/users/${user?.id}`, { name, bio, location }),
		onSuccess: async () => {
			await refreshUser();
			showSuccess(
				t("profile.profileUpdatedTitle"),
				t("profile.profileUpdatedMessage"),
			);
			close();
		},
		onError: (err: unknown) =>
			showError(t("auth.errorTitle"), getErrorMessage(err, t("common.error"))),
	});

	const fields = [
		{
			label: t("profile.fullNameLabel"),
			value: name,
			set: setName,
			placeholder: t("auth.fullNamePlaceholder"),
			keyboard: "default",
		},
		{
			label: t("profile.bioLabel"),
			value: bio,
			set: setBio,
			placeholder: t("profile.bioPlaceholderInput"),
			multiline: true,
		},
		{
			label: t("profile.locationLabel"),
			value: location,
			set: setLocation,
			placeholder: t("profile.locationPlaceholder"),
			keyboard: "default",
		},
	];

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<SettingsHeader
				title={t("profile.editProfileTitle")}
				right={
					<Pressable
						onPress={() => save()}
						disabled={isPending}
						accessibilityRole="button"
						accessibilityLabel={t("profile.save")}
						accessibilityState={{ disabled: isPending, busy: isPending }}
						hitSlop={12}
						style={styles.saveHit}
					>
						{isPending ? (
							<ActivityIndicator color={c.link} />
						) : (
							<Text style={[styles.saveBtn, { color: c.link }]}>
								{t("profile.save")}
							</Text>
						)}
					</Pressable>
				}
			/>

			<KeyboardAwareScrollView
				contentContainerStyle={[styles.scroll, centeredContent]}
				keyboardShouldPersistTaps="handled"
				bottomOffset={80}
			>
				{/* Avatar */}
				<View style={styles.avatarSection}>
					{avatarUri || user?.avatar?.url ? (
						<Image
							source={{
								uri:
									avatarUri ??
									resolveListingImageUrl(user?.avatar, "thumbnail") ??
									undefined,
							}}
							style={styles.avatar}
							contentFit="cover"
							accessibilityIgnoresInvertColors
						/>
					) : (
						<View
							style={[
								styles.avatarPlaceholder,
								{ backgroundColor: c.primaryTint },
							]}
						>
							<Text style={[styles.avatarLetter, { color: c.link }]}>
								{user?.name?.[0]?.toUpperCase()}
							</Text>
						</View>
					)}
					<Pressable
						style={({ pressed }) => [
							styles.changeAvatarBtn,
							{
								backgroundColor: c.card,
								borderColor: c.borderStrong,
								opacity: avatarUploading ? 0.6 : pressed ? 0.85 : 1,
							},
						]}
						onPress={handlePickAvatar}
						disabled={avatarUploading}
						hitSlop={4}
						accessibilityRole="button"
						accessibilityState={{
							disabled: avatarUploading,
							busy: avatarUploading,
						}}
					>
						{avatarUploading ? (
							<ActivityIndicator size="small" color={c.link} />
						) : (
							<>
								<Ionicons name="camera-outline" size={16} color={c.link} />
								<Text style={[styles.changeAvatarText, { color: c.link }]}>
									{t("profile.change")}
								</Text>
							</>
						)}
					</Pressable>
				</View>

				{/* Shop verification — an owner sees their badge and a way to raise
				    it; a visitor with no shop sees nothing, same as before shops
				    carried badges. */}
				{ownShop ? (
					<GroupedSection>
						<GroupedRow
							label={t("shop.increaseLevel")}
							onPress={() => router.push("/seller/verification" as never)}
							trailing={<LevelBadge badge={ownShop.badge} size="sm" />}
						/>
					</GroupedSection>
				) : null}

				{/* Fields */}
				{fields.map(
					({ label, value, set, placeholder, multiline, keyboard }) => (
						<FormField
							key={label}
							label={label}
							value={value}
							onChangeText={set}
							placeholder={placeholder}
							multiline={multiline}
							keyboardType={
								(keyboard as TextInputProps["keyboardType"]) ?? "default"
							}
						/>
					),
				)}

				<View style={styles.note}>
					<Ionicons
						name="information-circle-outline"
						size={18}
						color={c.mutedForeground}
					/>
					<Text style={[styles.infoText, { color: c.mutedForeground }]}>
						{t("profile.phoneManagedInSettings")}
					</Text>
				</View>
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	saveHit: { minHeight: 44, justifyContent: "center" },
	saveBtn: { fontSize: 16, fontFamily: Fonts.bodyBold },
	scroll: { padding: 16, paddingTop: 24, gap: 20, paddingBottom: 48 },
	avatarSection: { alignItems: "center", gap: 12 },
	avatar: { width: 96, height: 96, borderRadius: 48 },
	avatarPlaceholder: {
		width: 96,
		height: 96,
		borderRadius: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarLetter: { fontSize: 36, fontFamily: Fonts.displayBold },
	changeAvatarBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 40,
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 14,
	},
	changeAvatarText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	note: {
		flexDirection: "row",
		gap: 8,
		alignItems: "flex-start",
		paddingHorizontal: 4,
	},
	infoText: {
		flex: 1,
		fontSize: 13,
		lineHeight: 19,
		fontFamily: Fonts.body,
	},
});
