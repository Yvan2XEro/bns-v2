import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import fr from "../locales/fr.json";

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
	// Pluralization: i18next uses _plural suffix by default which matches our JSON keys.
	compatibilityJSON: "v4",
});

export default i18n;
export { useTranslation } from "react-i18next";
