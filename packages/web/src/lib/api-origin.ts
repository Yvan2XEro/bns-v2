/**
 * Where server-side code (rendering, server actions, the sitemap, error
 * reporting) reaches the API. A deployment that runs the API next to the web
 * app gives its in-cluster address in API_INTERNAL_URL (`http://api:3000`),
 * so each page's API calls skip the public DNS, the ingress and TLS; without
 * it, the public URL. Never shipped to the browser.
 */
export const SERVER_API_URL =
	process.env.API_INTERNAL_URL ||
	process.env.NEXT_PUBLIC_API_URL ||
	"http://localhost:3000";
