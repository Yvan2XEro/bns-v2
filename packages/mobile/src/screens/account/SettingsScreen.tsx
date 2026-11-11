import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Appearance,
	ScrollView,
	StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
	GroupedRow,
	GroupedSection,
	GroupedSwitchRow,
	useGroupedColors,
} from "@/src/components/settings/Grouped";
import { PermissionList } from "@/src/components/settings/PermissionList";
import { SettingsHeader } from "@/src/components/settings/SettingsHeader";
import { useResponsive } from "@/src/hooks/useResponsive";
import { areSoundsEnabled, setSoundsEnabled } from "@/src/lib/feedback";
import i18n, { useTranslation } from "@/src/lib/i18n";

export const LANG_STORAGE_KEY = "app_language";
export const THEME_STORAGE_KEY = "app_theme";

type Locale = "fr" | "en";
type ThemeChoice = "system" | "light" | "dark";

// Each language is named in itself, so it can be found whatever the app is
// set to.
const LANGUAGES: { code: Locale; label: string }[] = [
	{ code: "fr", label: "Français" },
	{ code: "en", label: "English" },
];

export function SettingsScreen() {
	const c = useGroupedColors();
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();
	const [updateChecked, setUpdateChecked] = useState(false);
	const [checkError, setCheckError] = useState(false);
	const [soundsOn, setSoundsOn] = useState(areSoundsEnabled());
	// "system" until a stored choice says otherwise; the root layout only
	// restores "light" and "dark", so "system" leaves the device in charge.
	const [themeChoice, setThemeChoice] = useState<ThemeChoice>("system");
	const [locale, setLocale] = useState<Locale>(
		i18n.language?.slice(0, 2) === "en" ? "en" : "fr",
	);

	useEffect(() => {
		let alive = true;
		AsyncStorage.getItem(THEME_STORAGE_KEY)
			.then((saved) => {
				if (!alive) return;
				if (saved === "light" || saved === "dark") setThemeChoice(saved);
			})
			.catch(() => {
				// No stored choice: the device decides.
			});
		return () => {
			alive = false;
		};
	}, []);

	const { isChecking, isDownloading, isUpdateAvailable, isUpdatePending } =
		Updates.useUpdates();

	const handleCheckUpdate = async () => {
		setCheckError(false);
		try {
			await Updates.checkForUpdateAsync();
			setUpdateChecked(true);
		} catch {
			setUpdateChecked(true);
			setCheckError(true);
		}
	};

	const handleDownloadUpdate = async () => {
		try {
			await Updates.fetchUpdateAsync();
		} catch {
			// download error surfaced via useUpdates().downloadError
		}
	};

	const handleRestart = async () => {
		await Updates.reloadAsync();
	};

	const version = Constants.expoConfig?.version ?? "1.0.0";

	const changeLanguage = async (next: Locale) => {
		setLocale(next);
		await i18n.changeLanguage(next);
		await AsyncStorage.setItem(LANG_STORAGE_KEY, next);
	};

	const changeTheme = (next: ThemeChoice) => {
		setThemeChoice(next); // update immediately — don't wait for Appearance event
		// React Native 0.86 hands the device back with 'unspecified' (Android:
		// MODE_NIGHT_FOLLOW_SYSTEM, iOS: UIUserInterfaceStyleUnspecified). The
		// old `null` is not in the type and the Android module takes a string.
		Appearance.setColorScheme(next === "system" ? "unspecified" : next);
		void AsyncStorage.setItem(THEME_STORAGE_KEY, next);
	};

	const themes: { value: ThemeChoice; label: string }[] = [
		{ value: "system", label: t("settings.themeSystem") },
		{ value: "light", label: t("settings.themeLight") },
		{ value: "dark", label: t("settings.themeDark") },
	];

	// The update row: what is true now, and the one thing to do next.
	const busy = isChecking || isDownloading;
	const update = isUpdatePending
		? {
				action: t("settings.restartNow"),
				onPress: handleRestart,
				status: t("settings.readyToInstall"),
				tone: "success" as const,
			}
		: isUpdateAvailable
			? {
					action: t("settings.download"),
					onPress: handleDownloadUpdate,
					status: t("settings.updateAvailable"),
					tone: "info" as const,
				}
			: {
					action: t("settings.checkForUpdates"),
					onPress: handleCheckUpdate,
					status: checkError
						? t("settings.checkFailed")
						: updateChecked
							? t("settings.upToDate")
							: null,
					tone: checkError
						? ("danger" as const)
						: updateChecked
							? ("success" as const)
							: ("info" as const),
				};
	const statusText = busy
		? isDownloading
			? t("settings.downloading")
			: t("settings.checking")
		: update.status;
	const statusColor =
		update.tone === "success"
			? c.successText
			: update.tone === "danger"
				? c.dangerText
				: c.link;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<SettingsHeader title={t("settings.title")} />

			<ScrollView
				contentContainerStyle={[styles.scroll, centeredContent]}
				showsVerticalScrollIndicator={false}
			>
				<GroupedSection title={t("settings.language")}>
					{LANGUAGES.map((lang) => (
						<GroupedRow
							key={lang.code}
							label={lang.label}
							onPress={() => void changeLanguage(lang.code)}
							accessibilityRole="radio"
							accessory={locale === lang.code ? "check" : "none"}
						/>
					))}
				</GroupedSection>

				<GroupedSection title={t("settings.theme")}>
					{themes.map((option) => (
						<GroupedRow
							key={option.value}
							label={option.label}
							onPress={() => changeTheme(option.value)}
							accessibilityRole="radio"
							accessory={themeChoice === option.value ? "check" : "none"}
						/>
					))}
				</GroupedSection>

				<GroupedSection
					title={t("settings.soundsSection")}
					footer={t("settings.soundsHint")}
				>
					<GroupedSwitchRow
						icon={soundsOn ? "volume-medium-outline" : "volume-mute-outline"}
						label={t("settings.soundsLabel")}
						value={soundsOn}
						onValueChange={(on) => {
							setSoundsOn(on);
							void setSoundsEnabled(on);
						}}
					/>
				</GroupedSection>

				<PermissionList title={t("settings.permissions.title")} />

				<GroupedSection title={t("settings.updatesSection")}>
					<GroupedRow
						icon="cloud-download-outline"
						iconTone="brand"
						label={update.action}
						onPress={() => void update.onPress()}
						disabled={busy}
						accessory="none"
						accessibilityHint={statusText ?? undefined}
						trailing={
							busy ? <ActivityIndicator size="small" color={c.link} /> : null
						}
					/>
					{statusText && !busy ? (
						<GroupedRow
							label={statusText}
							trailing={
								<Ionicons
									name={
										update.tone === "success"
											? "checkmark-circle"
											: update.tone === "danger"
												? "alert-circle"
												: "arrow-up-circle"
									}
									size={20}
									color={statusColor}
								/>
							}
						/>
					) : null}
				</GroupedSection>

				<GroupedSection title={t("settings.aboutSection")}>
					<GroupedRow label={t("settings.appVersion")} value={`v${version}`} />
				</GroupedSection>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	scroll: { padding: 16, paddingTop: 20, gap: 24, paddingBottom: 48 },
});
