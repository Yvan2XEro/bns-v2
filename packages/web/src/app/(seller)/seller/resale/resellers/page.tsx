import { redirect } from "next/navigation";
import { resaleHref } from "~/lib/resale-hub";

export default function ResaleResellersPage() {
	redirect(resaleHref("supplier", "resellers"));
}
