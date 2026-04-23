// NotchPay n'utilise pas de POST webhook signé.
// La vérification se fait via GET /api/public/boost/callback.
// Ce fichier est conservé pour ne pas casser les anciens liens.

export async function POST() {
	return Response.json(
		{
			error:
				"NotchPay utilise un callback GET. Voir /api/public/boost/callback.",
		},
		{ status: 410 },
	);
}
