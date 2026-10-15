import { redirect } from "next/navigation";
import { resaleHref } from "~/lib/resale-hub";

export default function ResaleSuppliersPage() {
	redirect(resaleHref("reseller", "suppliers"));
}
