import { redirect } from "next/navigation";

/** "My account", as the app and some notifications name it: the profile page. */
export default function AccountPage() {
	redirect("/profile/me");
}
