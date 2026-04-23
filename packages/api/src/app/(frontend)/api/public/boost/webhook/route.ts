// NotchPay n'utilise pas de POST webhook — voir /api/public/boost/callback (GET).
// Ce fichier est conservé uniquement pour les paiements Stripe.
export { POST } from "./stripe/route";
