import AsyncStorage from "@react-native-async-storage/async-storage";
import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

const ONBOARDING_STORAGE_KEY = "hasSeenOnboarding";

type OnboardingContextValue = {
	hasSeenOnboarding: boolean;
	isLoading: boolean;
	markOnboardingSeen: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let active = true;

		AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)
			.then((value) => {
				if (!active) return;
				setHasSeenOnboarding(value === "true");
			})
			.finally(() => {
				if (active) {
					setIsLoading(false);
				}
			});

		return () => {
			active = false;
		};
	}, []);

	const markOnboardingSeen = useCallback(async () => {
		await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
		setHasSeenOnboarding(true);
	}, []);

	const value = useMemo(
		() => ({
			hasSeenOnboarding,
			isLoading,
			markOnboardingSeen,
		}),
		[hasSeenOnboarding, isLoading, markOnboardingSeen],
	);

	return (
		<OnboardingContext.Provider value={value}>
			{children}
		</OnboardingContext.Provider>
	);
}

export function useOnboarding() {
	const context = useContext(OnboardingContext);

	if (!context) {
		throw new Error(
			"useOnboarding must be used within an <OnboardingProvider>",
		);
	}

	return context;
}
