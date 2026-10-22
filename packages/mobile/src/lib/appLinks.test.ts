import { describe, expect, test } from "bun:test";
import { redirectSystemPath } from "../../app/+native-intent";

const open = (path: string) => redirectSystemPath({ path, initial: true });

describe("links that open the app", () => {
	test("land a shared shop or listing on its screen", () => {
		expect(open("https://buynsellem.com/s/akwatech")).toBe("/s/akwatech");
		expect(open("https://buynsellem.com/listing/abc123")).toBe(
			"/listing/abc123",
		);
	});

	test("map the website's own paths to the app's", () => {
		expect(open("https://buynsellem.com/messages?conversation=c1")).toBe(
			"/messages/c1",
		);
		expect(open("https://buynsellem.com/profile/me/listings")).toBe(
			"/account/listings",
		);
		expect(open("https://buynsellem.com/search?q=velo")).toBe("/search?q=velo");
	});

	test("read the app's own scheme, the OAuth return included", () => {
		expect(open("buynsellem://listing/abc123")).toBe("/listing/abc123");
		expect(open("buynsellem://auth/callback?code=x")).toBe(
			"/auth/callback?code=x",
		);
	});

	test("send a page the app has no screen for home, and leave Expo's links alone", () => {
		expect(open("https://buynsellem.com/auth/reset-password?token=t")).toBe(
			"/",
		);
		expect(open("exp://192.168.0.5:8081/--/listing/1")).toBe(
			"exp://192.168.0.5:8081/--/listing/1",
		);
	});
});
