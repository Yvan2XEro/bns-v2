import "../src/lib/i18n";
import { Ionicons } from "@expo/vector-icons";
import {
	DMSans_400Regular,
	DMSans_500Medium,
	DMSans_600SemiBold,
	DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import {
	Outfit_500Medium,
	Outfit_600SemiBold,
	Outfit_700Bold,
	Outfit_800ExtraBold,
} from "@expo-google-fonts/outfit";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	DarkTheme,
	DefaultTheme,
	ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { LoadingScreen } from "@/src/components/LoadingScreen";
import { AlertProvider } from "@/src/contexts/AlertContext";
import { AuthProvider, useAuth } from "@/src/lib/auth";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000,
			retry: 2,
		},
	},
});

export const unstable_settings = { anchor: "(tabs)" };

// ─── Root layout ──────────────────────────────────────────────────────────────
// Loads fonts, hides the native splash, then mounts providers.

export default function RootLayout() {
	const [fontsLoaded] = useFonts({
		...Ionicons.font,
		DMSans_400Regular,
		DMSans_500Medium,
		DMSans_600SemiBold,
		DMSans_700Bold,
		Outfit_500Medium,
		Outfit_600SemiBold,
		Outfit_700Bold,
		Outfit_800ExtraBold,
	});

	useEffect(() => {
		if (fontsLoaded) {
			SplashScreen.hideAsync();
		}
	}, [fontsLoaded]);

	// Keep the native splash visible until fonts are ready.
	if (!fontsLoaded) return null;

	return (
		<KeyboardProvider>
			<QueryClientProvider client={queryClient}>
				<AuthProvider>
					<AlertProvider>
						<RootLayoutNav />
					</AlertProvider>
				</AuthProvider>
			</QueryClientProvider>
		</KeyboardProvider>
	);
}

// ─── Inner nav component ──────────────────────────────────────────────────────
// Has access to AuthProvider — handles loading overlay + onboarding redirect.

function RootLayoutNav() {
	const colorScheme = useColorScheme();
	const { isLoading: authLoading } = useAuth();

	const [onboardingChecked, setOnboardingChecked] = useState(false);
	const [isFirstLaunch, setIsFirstLaunch] = useState(false);

	// Check AsyncStorage once on mount
	useEffect(() => {
		AsyncStorage.getItem("hasSeenOnboarding").then((value) => {
			setIsFirstLaunch(value === null);
			setOnboardingChecked(true);
		});
	}, []);

	// Show custom loading screen while auth session restores + onboarding check
	const showLoader = authLoading || !onboardingChecked;

	// Redirect to onboarding once both checks are done
	useEffect(() => {
		if (!showLoader && isFirstLaunch) {
			router.replace("/onboarding");
		}
	}, [showLoader, isFirstLaunch]);

	return (
		<ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
			<Stack>
				<Stack.Screen name="onboarding" options={{ headerShown: false }} />
				<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
				<Stack.Screen name="listing/[id]" options={{ headerShown: false }} />
				<Stack.Screen
					name="listing/[id]/edit"
					options={{ headerShown: false }}
				/>
				<Stack.Screen
					name="account/edit-profile"
					options={{ headerShown: false }}
				/>
				<Stack.Screen
					name="account/favorites"
					options={{ headerShown: false }}
				/>
				<Stack.Screen
					name="account/listings"
					options={{ headerShown: false }}
				/>
				<Stack.Screen name="account/boosts" options={{ headerShown: false }} />
				<Stack.Screen
					name="account/searches"
					options={{ headerShown: false }}
				/>
				<Stack.Screen
					name="profile/[userId]"
					options={{ headerShown: false }}
				/>
				<Stack.Screen
					name="auth/login"
					options={{ presentation: "modal", headerShown: false }}
				/>
				<Stack.Screen
					name="auth/register"
					options={{ presentation: "modal", headerShown: false }}
				/>
				<Stack.Screen
					name="auth/forgot-password"
					options={{ presentation: "modal", headerShown: false }}
				/>
				<Stack.Screen
					name="filters"
					options={{ presentation: "modal", headerShown: false }}
				/>
				<Stack.Screen
					name="boost/[listingId]"
					options={{ presentation: "modal", headerShown: false }}
				/>
				<Stack.Screen
					name="report"
					options={{ presentation: "modal", headerShown: false }}
				/>
				<Stack.Screen name="settings" options={{ headerShown: false }} />
				<Stack.Screen name="contact" options={{ headerShown: false }} />
				<Stack.Screen name="help" options={{ headerShown: false }} />
				<Stack.Screen name="safety" options={{ headerShown: false }} />
				<Stack.Screen name="terms" options={{ headerShown: false }} />
				<Stack.Screen name="privacy" options={{ headerShown: false }} />
			</Stack>

			{/* Custom in-app loading overlay (auth restore + onboarding check) */}
			{showLoader && <LoadingScreen />}

			<StatusBar style="auto" />
		</ThemeProvider>
	);
}
