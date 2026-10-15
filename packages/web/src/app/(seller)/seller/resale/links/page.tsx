import { redirect } from "next/navigation";
import { resaleHref } from "~/lib/resale-hub";

export default function ResaleLinksPage() {
	redirect(resaleHref("supplier", "resellers"));
}
