import { redirect } from "next/navigation";

/** A resale link named by a notification: the links page lists it. */
export default function ResaleLinkLink() {
	redirect("/seller/resale/links");
}
