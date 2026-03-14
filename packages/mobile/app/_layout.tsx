import "../src/lib/i18n";
import {
	DarkTheme,
	DefaultTheme,
	ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AuthProvider } from "@/src/lib/auth";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000, // 5 minutes
			retry: 2,
		},
	},
});

export const unstable_settings = { anchor: "(tabs)" };

export default function RootLayout() {
	const colorScheme = useColorScheme();

	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<ThemeProvider
					value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
				>
					<Stack>
						<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
						<Stack.Screen
							name="listing/[id]"
							options={{ headerShown: false }}
						/>
						<Stack.Screen
							name="listing/[id]/edit"
							options={{ title: "Edit Listing" }}
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
							options={{ presentation: "modal", title: "Reset Password" }}
						/>
						<Stack.Screen
							name="filters"
							options={{ presentation: "modal", title: "Filters" }}
						/>
						<Stack.Screen
							name="boost/[listingId]"
							options={{ presentation: "modal", headerShown: false }}
						/>
						<Stack.Screen
							name="report"
							options={{ presentation: "modal", headerShown: false }}
						/>
						<Stack.Screen name="settings" options={{ title: "Settings" }} />
						<Stack.Screen name="contact" options={{ title: "Contact Us" }} />
						<Stack.Screen name="help" options={{ title: "Help & FAQ" }} />
						<Stack.Screen name="safety" options={{ title: "Safety Tips" }} />
						<Stack.Screen
							name="terms"
							options={{ title: "Terms of Service" }}
						/>
						<Stack.Screen
							name="privacy"
							options={{ title: "Privacy Policy" }}
						/>
					</Stack>
					<StatusBar style="auto" />
				</ThemeProvider>
			</AuthProvider>
		</QueryClientProvider>
	);
}
