import { LegalDocument } from "@/src/components/settings/LegalDocument";
import { useTranslation } from "@/src/lib/i18n";

// Content lives in src/locales/{en,fr}.json under `terms.sections.*` so the terms
// exist in both app languages. Order here is the order on screen, and it must
// stay in sync with the keys declared in the locale files.
const SECTION_KEYS = [
	"acceptance",
	"service",
	"eligibility",
	"prohibited",
	"responsibility",
	"moderation",
	"intellectualProperty",
	"dataProtection",
	"suspension",
	"changes",
] as const;

export function TermsScreen() {
	const { t } = useTranslation();
	return (
		<LegalDocument
			title={t("terms.title")}
			updated={t("terms.lastUpdated")}
			sections={SECTION_KEYS.map((key) => ({
				key,
				title: t(`terms.sections.${key}.title`),
				body: t(`terms.sections.${key}.body`),
			}))}
		/>
	);
}
