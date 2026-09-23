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
