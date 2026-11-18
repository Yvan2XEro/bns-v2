import { notFound } from "next/navigation";

/**
 * Any /seller/… path no page answers. Left unmatched, Next renders the root
 * not-found, outside the seller shell: the sidebar and the top bar vanish.
 * Matched here, it renders (seller)/not-found.tsx inside the shell.
 */
export default function SellerPageNotFound() {
	notFound();
}
