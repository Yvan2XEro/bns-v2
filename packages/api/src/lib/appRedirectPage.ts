/**
 * Hands a browser back to the mobile app. An in-app browser does not
 * reliably follow a 302 to a custom scheme, so the page replaces itself and
 * keeps a tappable link as the fallback.
 */
export function appRedirectPage(deepLink: string): Response {
	return new Response(
		`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Retour vers l'app…</title>
  <script>window.location.replace(${JSON.stringify(deepLink)});</script>
  <meta http-equiv="refresh" content="0;url=${deepLink}" />
</head>
<body style="font-family:sans-serif;text-align:center;padding-top:80px">
  <p>Redirection vers l'application…</p>
  <p><a href="${deepLink}">Appuyer ici si la redirection ne fonctionne pas</a></p>
</body>
</html>`,
		{ headers: { "Content-Type": "text/html; charset=utf-8" } },
	);
}
