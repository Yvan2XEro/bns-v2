import { redirect } from "next/navigation";
import { resaleHref } from "~/lib/resale-hub";

export default function ResaleCataloguePage() {
	redirect(resaleHref("reseller", "find"));
}
