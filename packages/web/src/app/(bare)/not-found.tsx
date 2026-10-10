import { useTranslations } from "next-intl";
import { NotFoundView } from "~/components/not-found-view";

export default function BareNotFound() {
	const t = useTranslations("NotFoundBare");
	return <NotFoundView title={t("title")} body={t("body")} size={160} />;
}
