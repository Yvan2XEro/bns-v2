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
import { useQuery } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import "react-native-reanimated";
import { NovuProvider } from "@novu/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { LoadingScreen } from "@/src/components/LoadingScreen";
import { AlertProvider } from "@/src/contexts/AlertContext";
import { ChatProvider } from "@/src/contexts/ChatContext";
import { NotificationReadyContext } from "@/src/contexts/NotificationReadyContext";
import { api } from "@/src/lib/api";
import { AuthProvider, useAuth } from "@/src/lib/auth";
import {
	registerForPushNotificationsAsync,
	syncPushTokenWithBackend,
} from "@/src/lib/notifications";

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

	if (!fontsLoaded) return null;

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<KeyboardProvider>
				<QueryClientProvider client={queryClient}>
					<AuthProvider>
						<NovuWrapper>
							<ChatProvider>
								<AlertProvider>
									<PushTokenRegistrar />
									<PushNotificationHandler />
									<RootLayoutNav />
								</AlertProvider>
							</ChatProvider>
						</NovuWrapper>
					</AuthProvider>
				</QueryClientProvider>
			</KeyboardProvider>
		</GestureHandlerRootView>
	);
}

// ─── NovuWrapper ──────────────────────────────────────────────────────────────
// NovuProvider is rendered only when the user is authenticated.
// All components that call Novu hooks (useCounts, useNotifications) are
// themselves conditionally mounted on user auth — so a hook is never called
// outside its provider context, which respects React's rules of hooks.

function NovuWrapper({ children }: { children: React.ReactNode }) {
	const { user } = useAuth();
	const appId = process.env.EXPO_PUBLIC_NOVU_APP_ID ?? "";
	const [ready, setReady] = useState(false);

	const { data } = useQuery({
		queryKey: ["novu-subscriber-hash", user?.id],
		queryFn: () =>
			api.get<{ subscriberHash: string }>("/api/public/novu/subscriber-hash"),
		enabled: !!user && !!appId,
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	});

	// Set ready one render cycle after NovuProvider mounts, so consumers that
	// call Novu hooks (useCounts, useNotifications) are never rendered in the
	// same cycle as NovuProvider — avoiding "must be used within NovuProvider".
	useEffect(() => {
		if (user && appId) setReady(true);
		else setReady(false);
	}, [user?.id, appId, user]);

	if (!user || !appId) {
		return (
			<NotificationReadyContext.Provider value={false}>
				{children}
			</NotificationReadyContext.Provider>
		);
	}

	return (
		<NovuProvider
			key={user.id}
			subscriberId={user.id}
			applicationIdentifier={appId}
			subscriberHash={data?.subscriberHash}
		>
			<NotificationReadyContext.Provider value={ready}>
				{children}
			</NotificationReadyContext.Provider>
		</NovuProvider>
	);
}

// ─── PushTokenRegistrar ───────────────────────────────────────────────────────
// Requests push permission and syncs the Expo token with Novu once per session.

function PushTokenRegistrar() {
	const { user } = useAuth();
	const registeredRef = useRef<string | null>(null);

	useEffect(() => {
		if (!user) return;
		if (registeredRef.current === user.id) return;
		registeredRef.current = user.id;

		registerForPushNotificationsAsync().then((token) => {
			if (token) syncPushTokenWithBackend(token);
		});
	}, [user]);

	return null;
}

// ─── PushNotificationHandler ─────────────────────────────────────────────────
// Handles deep-link navigation when the user taps a push notification.
// Works for two scenarios:
//   - Cold start: app was killed, notification tap launches it
//   - Background: app was backgrounded, user taps notification
// Navigation is deferred until auth is resolved and the user is logged in.

function resolveNotificationUrl(data: Record<string, unknown>): string | null {
	const conversationId = data?.conversationId as string | undefined;
	const listingId = data?.listingId as string | undefined;
	if (conversationId) return `/messages/${conversationId}`;
	if (listingId) return `/listing/${listingId}`;
	return null;
}

function PushNotificationHandler() {
	const { isLoading, user } = useAuth();
	const pendingUrlRef = useRef<string | null>(null);
	const isReady = !isLoading && !!user;

	useEffect(() => {
		Notifications.getLastNotificationResponseAsync().then((response) => {
			if (!response) return;
			const url = resolveNotificationUrl(
				response.notification.request.content.data as Record<string, unknown>,
			);
			if (url) pendingUrlRef.current = url;
		});
	}, []);

	useEffect(() => {
		const sub = Notifications.addNotificationResponseReceivedListener(
			(response) => {
				const url = resolveNotificationUrl(
					response.notification.request.content.data as Record<string, unknown>,
				);
				if (!url) return;
				if (isReady) router.push(url as Parameters<typeof router.push>[0]);
				else pendingUrlRef.current = url;
			},
		);
		return () => sub.remove();
	}, [isReady]);

	useEffect(() => {
		if (isReady && pendingUrlRef.current) {
			router.push(pendingUrlRef.current as Parameters<typeof router.push>[0]);
			pendingUrlRef.current = null;
		}
	}, [isReady]);

	return null;
}

// ─── RootLayoutNav ────────────────────────────────────────────────────────────

function RootLayoutNav() {
	const colorScheme = useColorScheme();
	const { isLoading: authLoading } = useAuth();

	const [onboardingChecked, setOnboardingChecked] = useState(false);
	const [isFirstLaunch, setIsFirstLaunch] = useState(false);

	useEffect(() => {
		AsyncStorage.getItem("hasSeenOnboarding").then((value) => {
			setIsFirstLaunch(value === null);
			setOnboardingChecked(true);
		});
	}, []);

	const showLoader = authLoading || !onboardingChecked;

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
					name="account/notifications"
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

			{showLoader && <LoadingScreen />}

			<StatusBar style="auto" />
		</ThemeProvider>
	);
}
