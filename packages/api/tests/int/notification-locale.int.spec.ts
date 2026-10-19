// @vitest-environment node
import type { Payload } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

const trigger = vi.fn(async () => ({}));
vi.mock("../../src/services/notificationProvider", () => ({
	getNotificationProvider: () => ({ trigger }),
	isNotificationProviderConfigured: () => true,
}));

import {
	inLocale,
	localized,
	localizedField,
	localizedFields,
	notificationLocaleOf,
} from "../../src/contracts/notificationLocale";
import {
	registerNotificationLocales,
	triggerNotificationEvent,
} from "../../src/hooks/notificationEvents";

const EN_USER = "64f0c0ffee00000000000001";
const FR_USER = "64f0c0ffee00000000000002";

function sentLocale(): unknown {
	const calls = trigger.mock.calls as unknown as [
		{ payload: { locale?: unknown } },
	][];
	return calls.at(-1)?.[0].payload.locale;
}

describe("the language a notification is written in", () => {
	beforeEach(() => {
		trigger.mockClear();
		registerNotificationLocales({
			findByID: vi.fn(async ({ id }: { id: string }) => ({
				id,
				language: id === EN_USER ? "en" : "fr",
			})),
		} as unknown as Payload);
	});

	it("is the recipient's own", async () => {
		await triggerNotificationEvent({
			event: "listing-approved",
			subscriberId: EN_USER,
			payload: { listingId: "l-1", listingTitle: "Vélo" },
		});
		expect(sentLocale()).toBe("en");

		await triggerNotificationEvent({
			event: "listing-approved",
			subscriberId: FR_USER,
			payload: { listingId: "l-1", listingTitle: "Vélo" },
		});
		expect(sentLocale()).toBe("fr");
	});

	it("is French for a recipient without an account", async () => {
		await triggerNotificationEvent({
			event: "contact-form",
			subscriberId: "admin",
			payload: { subject: "Bonjour" },
		});
		expect(sentLocale()).toBe("fr");
	});

	it("reads any English tag as English and anything else as French", () => {
		expect(notificationLocaleOf("en-GB")).toBe("en");
		expect(notificationLocaleOf("de")).toBe("fr");
		expect(notificationLocaleOf(null)).toBe("fr");
	});

	it("puts every wording in one template, the default language last", () => {
		expect(localized({ fr: "Bonjour", en: "Hello" })).toBe(
			"{% if payload.locale == 'en' %}Hello{% else %}Bonjour{% endif %}",
		);
	});

	it("sends a per-event text as one field per language, and picks it back", () => {
		expect(
			localizedFields("caseTitle", { fr: "Retour", en: "Return" }),
		).toEqual({ caseTitle_fr: "Retour", caseTitle_en: "Return" });
		expect(localizedField("caseTitle")).toBe(
			"{% if payload.locale == 'en' %}{{payload.caseTitle_en}}{% else %}{{payload.caseTitle_fr}}{% endif %}",
		);
	});

	it("picks an SMS text in the recipient's language", () => {
		expect(inLocale({ fr: "Bonjour", en: "Hello" }, "en-US")).toBe("Hello");
		expect(inLocale({ fr: "Bonjour", en: "Hello" }, undefined)).toBe("Bonjour");
	});
});
