import type { Href } from "expo-router";
import type { ComponentType } from "react";
import { DisputesScreen } from "@/src/screens/disputes/DisputesScreen";
import { PurchasesScreen } from "@/src/screens/purchases/PurchasesScreen";
import { ReturnsScreen } from "@/src/screens/returns/ReturnsScreen";
import { AddressesScreen } from "./AddressesScreen";
import { BoostHistoryScreen } from "./BoostHistoryScreen";
import { CartScreen } from "./CartScreen";
import { ContactScreen } from "./ContactScreen";
import { EditProfileScreen } from "./EditProfileScreen";
import { FavoritesScreen } from "./FavoritesScreen";
import { HelpScreen } from "./HelpScreen";
import { MyListingsScreen } from "./MyListingsScreen";
import { NotificationsScreen } from "./NotificationsScreen";
import { PrivacyScreen } from "./PrivacyScreen";
import { SafetyScreen } from "./SafetyScreen";
import { SavedSearchesScreen } from "./SavedSearchesScreen";
import { SecurityScreen } from "./SecurityScreen";
import { SettingsScreen } from "./SettingsScreen";
import { TermsScreen } from "./TermsScreen";

/**
 * The account menu's entries that open beside it on a tablet in landscape:
 * each one's own screen (for a phone and deep links) and the component the
 * pane shows. Workspaces — seller mode, moderation, the courier space,
 * opening a shop — take the whole screen instead and are not listed.
 */
export const ACCOUNT_PANES = {
	editProfile: { href: "/account/edit-profile", Screen: EditProfileScreen },
	purchases: { href: "/purchases", Screen: PurchasesScreen },
	disputes: { href: "/account/disputes", Screen: DisputesScreen },
	returns: { href: "/account/returns", Screen: ReturnsScreen },
	addresses: { href: "/account/addresses", Screen: AddressesScreen },
	cart: { href: "/cart", Screen: CartScreen },
	favorites: { href: "/account/favorites", Screen: FavoritesScreen },
	searches: { href: "/account/searches", Screen: SavedSearchesScreen },
	listings: { href: "/account/listings", Screen: MyListingsScreen },
	boosts: { href: "/account/boosts", Screen: BoostHistoryScreen },
	settings: { href: "/settings", Screen: SettingsScreen },
	security: { href: "/security", Screen: SecurityScreen },
	notifications: {
		href: "/account/notifications",
		Screen: NotificationsScreen,
	},
	help: { href: "/help", Screen: HelpScreen },
	safety: { href: "/safety", Screen: SafetyScreen },
	contact: { href: "/contact", Screen: ContactScreen },
	terms: { href: "/terms", Screen: TermsScreen },
	privacy: { href: "/privacy", Screen: PrivacyScreen },
} as const satisfies Record<string, { href: Href; Screen: ComponentType }>;

export type AccountPane = keyof typeof ACCOUNT_PANES;

export function isAccountPane(id: string): id is AccountPane {
	return Object.hasOwn(ACCOUNT_PANES, id);
}
