import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import { setContentLocale } from "./contentLocale";

const languageTag = Localization.getLocales()[0]?.languageTag ?? "fr";
const lng = languageTag.startsWith("fr") ? "fr" : "en";

i18n.use(initReactI18next).init({
	resources: {
		en: { translation: en },
		fr: { translation: fr },
	},
	lng,
	fallbackLng: "fr",
	interpolation: { escapeValue: false },
	// Pluralization: v4 suffixes. A count of one reads `key_one`, every other
	// count the bare `key`; `_plural` is the v3 suffix and is never read here
	// (src/locales/keys.test.ts refuses it).
	compatibilityJSON: "v4",
});

setContentLocale(lng);

export default i18n;
export { useTranslation } from "react-i18next";
