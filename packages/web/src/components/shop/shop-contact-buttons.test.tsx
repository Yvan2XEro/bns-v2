import { describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import en from "~/../messages/en.json";
import { AuthContext, type AuthContextType } from "~/hooks/use-auth";

mock.module("next/navigation", () => ({
	useRouter: () => ({ push: () => {} }),
}));

const { ShopContactButtons } = await import("./shop-contact-buttons");

const signedOut = {
	user: null,
	token: null,
	isLoading: false,
} as unknown as AuthContextType;

describe("ShopContactButtons", () => {
	test("shows Contacter even when the shop filled no business channel", () => {
		const html = renderToStaticMarkup(
			<QueryClientProvider client={new QueryClient()}>
				<AuthContext.Provider value={signedOut}>
					<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
						<ShopContactButtons
							shopId="s-1"
							contact={{ whatsapp: null, phone: null, email: null }}
						/>
					</NextIntlClientProvider>
				</AuthContext.Provider>
			</QueryClientProvider>,
		);
		expect(html).toContain(en.ShopPage.contact);
	});
});
