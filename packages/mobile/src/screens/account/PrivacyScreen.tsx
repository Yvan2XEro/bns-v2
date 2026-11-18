import { LegalDocument } from "@/src/components/settings/LegalDocument";
import { useTranslation } from "@/src/lib/i18n";

// Content lives in src/locales/{en,fr}.json under `privacy.sections.*` so the
// policy exists in both app languages. Order here is the order on screen, and it
// must stay in sync with the keys declared in the locale files.
const SECTION_KEYS = [
	"intro",
	"account",
	"phone",
	"social",
	"photos",
	"location",
	"content",
	"messaging",
	"push",
	"device",
	"noTracking",
	"visibility",
	"sharing",
	"deletion",
	"retention",
	"rights",
	"children",
	"security",
	"changes",
	"sellerVerification",
	"contact",
] as const;

export function PrivacyScreen() {
	const { t } = useTranslation();
	return (
		<LegalDocument
			title={t("privacy.title")}
			updated={t("privacy.lastUpdated")}
			sections={SECTION_KEYS.map((key) => ({
				key,
				title: t(`privacy.sections.${key}.title`),
				body: t(`privacy.sections.${key}.body`),
			}))}
		/>
	);
}
