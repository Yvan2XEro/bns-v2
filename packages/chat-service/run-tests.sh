#!/bin/sh
# One `bun test` process per file, because `mock.module` is process-global.
#
# Bun's `mock.module` installs a live binding for the whole process, not for
# the file that called it. So when the suite runs as one invocation, a file
# that mocks `../redis.ts` or `../cache.ts` keeps that mock in place for every
# file loaded afterwards, and any file needing the real module gets the other
# one's double. The result was 15 failures in a combined run while all six
# files passed individually — a suite whose aggregate result said nothing,
# and which hid a genuinely broken `auth.test.ts` inside its own noise.
#
# Per-file processes cost about a second in total and make a red result mean
# something. Remove this the day Bun scopes `mock.module` to its caller.
set -e
status=0
for file in src/__tests__/*.test.ts; do
	if ! bun test "$file"; then
		status=1
	fi
done
exit $status
