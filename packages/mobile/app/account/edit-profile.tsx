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
	TextInput,
	type TextInputProps,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";
import { createMediaUploadFormData } from "@/src/lib/mediaUpload";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

export default function EditProfileScreen() {
	const isDark = useColorScheme() === "dark";
	const { centeredContent } = useResponsive();
	const { user, refreshUser } = useAuth();
	const { showSuccess, showError, showAlert } = useAlert();
	const { t } = useTranslation();

	const [name, setName] = useState(user?.name ?? "");
	const [bio, setBio] = useState(user?.bio ?? "");
	const [location, setLocation] = useState(user?.location ?? "");
	const [avatarUri, setAvatarUri] = useState<string | null>(null);
	const [avatarUploading, setAvatarUploading] = useState(false);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

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
			router.back();
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
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.headerTitle, { color: textColor }]}>
					{t("profile.editProfileTitle")}
				</Text>
				<Pressable onPress={() => save()} disabled={isPending}>
					{isPending ? (
						<ActivityIndicator color={primaryColor} />
					) : (
						<Text style={[styles.saveBtn, { color: primaryColor }]}>
							{t("profile.save")}
						</Text>
					)}
				</Pressable>
			</View>

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
									avatarUri ?? resolveImageUrl(user?.avatar?.url) ?? undefined,
							}}
							style={styles.avatar}
							contentFit="cover"
						/>
					) : (
						<View
							style={[
								styles.avatarPlaceholder,
								{ backgroundColor: isDark ? "#1e3a5f" : "#dbeafe" },
							]}
						>
							<Text style={[styles.avatarLetter, { color: primaryColor }]}>
								{user?.name?.[0]?.toUpperCase()}
							</Text>
						</View>
					)}
					<Pressable
						style={[
							styles.changeAvatarBtn,
							{
								backgroundColor: primaryColor,
								opacity: avatarUploading ? 0.7 : 1,
							},
						]}
						onPress={handlePickAvatar}
						disabled={avatarUploading}
					>
						{avatarUploading ? (
							<ActivityIndicator size="small" color="#fff" />
						) : (
							<>
								<Ionicons name="camera" size={14} color="#fff" />
								<Text style={styles.changeAvatarText}>
									{t("profile.change")}
								</Text>
							</>
						)}
					</Pressable>
				</View>

				{/* Verification banner */}
				{user?.verified ? (
					<View
						style={[
							styles.banner,
							{
								backgroundColor: isDark ? "#0f2a1a" : "#f0fdf4",
								borderColor: "#16a34a",
							},
						]}
					>
						<Ionicons name="checkmark-circle" size={18} color="#16a34a" />
						<Text style={[styles.bannerText, { color: "#16a34a" }]}>
							{t("profile.verifiedBanner")}
						</Text>
					</View>
				) : (
					<View
						style={[
							styles.banner,
							{
								backgroundColor: isDark ? "#162032" : "#eff6ff",
								borderColor: primaryColor,
							},
						]}
					>
						<Ionicons
							name="information-circle"
							size={18}
							color={primaryColor}
						/>
						<Text style={[styles.bannerText, { color: primaryColor, flex: 1 }]}>
							{t("profile.unverifiedBanner")}
						</Text>
					</View>
				)}

				{/* Fields */}
				{fields.map(
					({ label, value, set, placeholder, multiline, keyboard }) => (
						<View key={label} style={{ gap: 6 }}>
							<Text style={[styles.fieldLabel, { color: mutedColor }]}>
								{label}
							</Text>
							<TextInput
								value={value}
								onChangeText={set}
								placeholder={placeholder}
								placeholderTextColor={mutedColor}
								style={[
									styles.field,
									{ backgroundColor: cardBg, borderColor, color: textColor },
									multiline && styles.multiline,
								]}
								multiline={multiline}
								numberOfLines={multiline ? 4 : 1}
								keyboardType={
									(keyboard as TextInputProps["keyboardType"]) ?? "default"
								}
							/>
						</View>
					),
				)}

				<View
					style={[styles.infoBox, { backgroundColor: cardBg, borderColor }]}
				>
					<Text style={[styles.infoText, { color: mutedColor }]}>
						{t("profile.phoneManagedInSettings")}
					</Text>
				</View>
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	headerTitle: { fontSize: 17, fontFamily: Fonts.displayBold },
	saveBtn: { fontSize: 15, fontFamily: Fonts.displayBold },
	scroll: { padding: 20, gap: 16, paddingBottom: 40 },
	avatarSection: { alignItems: "center", gap: 10 },
	avatar: { width: 90, height: 90, borderRadius: 45 },
	avatarPlaceholder: {
		width: 90,
		height: 90,
		borderRadius: 45,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarLetter: { fontSize: 34, fontFamily: Fonts.displayBold },
	changeAvatarBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		paddingHorizontal: 14,
		paddingVertical: 7,
	},
	changeAvatarText: {
		color: "#fff",
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},
	banner: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderRadius: 10,
		borderWidth: 1,
		padding: 12,
	},
	bannerText: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	fieldLabel: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	field: {
		borderRadius: 10,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 11,
		fontSize: 15,
		fontFamily: Fonts.body,
	},
	infoBox: {
		borderRadius: 10,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 12,
	},
	infoText: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.body,
	},
	multiline: { minHeight: 100, textAlignVertical: "top" },
});
