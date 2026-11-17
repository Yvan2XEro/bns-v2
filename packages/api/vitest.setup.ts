// Any setup scripts you might need go here

// Load .env files
import "dotenv/config";

// Bun auto-loads .env before this file runs, so a developer's real
// NOVU_SECRET_KEY would otherwise survive into the test process. Any
// unmocked spec that lands a service call triggering a notification would
// then reach Novu's live API and hang under a network-restricted sandbox —
// setting the key rather than deleting it is what sticks, since Bun only
// loads .env once at process start and nothing here re-reads the file.
process.env.NOVU_SECRET_KEY = "";

// The suite must not depend on a developer's .env: a fresh checkout (or CI)
// has none, and the signed-URL and account-deletion paths sign with this.
// A test-only value, used only when nothing is set.
process.env.PAYLOAD_SECRET ||= "test-only-payload-secret";

// Several specs build their expected dates with the machine's own clock and
// were written in Cameroon; pin the zone so a UTC machine or CI agrees.
process.env.TZ = "Africa/Douala";
