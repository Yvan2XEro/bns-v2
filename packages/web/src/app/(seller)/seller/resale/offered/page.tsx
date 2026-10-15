import { redirect } from "next/navigation";
import { resaleHref } from "~/lib/resale-hub";

export default function ResaleOfferedPage() {
	redirect(resaleHref("supplier", "offered"));
}
