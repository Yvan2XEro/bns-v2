// @vitest-environment node
import { describe, expect, it } from "vitest";
import { novuApiUrl, novuEndpoints } from "../../src/contracts/novuEndpoints";

describe("novuEndpoints", () => {
	it("is off without an application identifier", () => {
		expect(
			novuEndpoints({ NOVU_API_URL: "https://novu-api.example.com" }),
		).toBeNull();
	});

	it("leaves the SDKs on Novu Cloud by default", () => {
		expect(novuEndpoints({ NOVU_APPLICATION_IDENTIFIER: "app" })).toEqual({
			applicationIdentifier: "app",
			apiUrl: null,
			socketUrl: null,
		});
		expect(
			novuEndpoints({
				NOVU_APPLICATION_IDENTIFIER: "app",
				NOVU_API_URL: "https://api.novu.co/",
			})?.apiUrl,
		).toBeNull();
	});

	it("points every client at a self-hosted instance", () => {
		expect(
			novuEndpoints({
				NOVU_APPLICATION_IDENTIFIER: " app ",
				NOVU_API_URL: "https://novu-api.example.com/",
				NOVU_SOCKET_URL: "https://novu-ws.example.com",
			}),
		).toEqual({
			applicationIdentifier: "app",
			apiUrl: "https://novu-api.example.com",
			socketUrl: "https://novu-ws.example.com",
		});
	});

	it("takes a WebSocket address for the socket", () => {
		expect(
			novuEndpoints({
				NOVU_APPLICATION_IDENTIFIER: "app",
				NOVU_SOCKET_URL: "wss://novu-ws.example.com/",
			})?.socketUrl,
		).toBe("wss://novu-ws.example.com");
		expect(
			novuApiUrl({ NOVU_API_URL: "wss://novu-api.example.com" }),
		).toBeNull();
	});

	it("ignores what is not an http(s) URL", () => {
		expect(novuApiUrl({ NOVU_API_URL: "novu-api.example.com" })).toBeNull();
		expect(
			novuEndpoints({
				NOVU_APPLICATION_IDENTIFIER: "app",
				NOVU_SOCKET_URL: "ftp://novu-ws.example.com",
			})?.socketUrl,
		).toBeNull();
	});
});
