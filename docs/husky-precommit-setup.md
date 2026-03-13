# Husky Pre-Commit Setup for Bun/Turbo Monorepos

Step-by-step guide to integrate **Husky** pre-commit hooks with **Biome** (lint + format) and **TypeScript type checking** (via Turbo) in a Bun-based monorepo.

## Prerequisites

- Bun as package manager (`bun install`)
- Turborepo for task orchestration
- Biome for linting and formatting
- TypeScript in each package/app
- Git repository initialized

## Monorepo Structure (example)

```
my-repo/
├── apps/
│   └── web/           # Next.js app, etc.
├── packages/
│   ├── api/           # Backend service
│   ├── chat-service/  # Microservice
│   └── shared/        # Shared library
├── turbo.json
├── biome.json
├── package.json
└── .husky/
    └── pre-commit
```

---

## Step 1: Install Husky

Install Husky as a root dev dependency and initialize it:

```bash
bun add -d husky
bunx husky init
```

This does two things:

1. Adds `husky` to `devDependencies` in root `package.json`
2. Creates the `.husky/` directory with a sample `pre-commit` file
3. Adds a `"prepare": "husky"` script to root `package.json`

Verify your root `package.json` has the `prepare` script — this is what tells Husky to install Git hooks automatically when anyone runs `bun install`:

```json
{
  "scripts": {
    "prepare": "husky"
  },
  "devDependencies": {
    "husky": "^9.1.7"
  }
}
```

> **Important:** Every developer who clones the repo just needs to run `bun install` and Husky hooks are automatically set up. No extra steps needed.

---

## Step 2: Install and Configure Biome

If not already installed:

```bash
bun add -d @biomejs/biome
```

Create a `biome.json` at the repo root. Here's a recommended configuration:

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": true,
    "includes": [
      "**",
      "!**/.next",
      "!**/dist",
      "!**/.turbo",
      "!**/out",
      "!**/build",
      "!**/coverage",
      "!**/*.gen.ts"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab"
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "warn",
        "noUnusedImports": "warn"
      },
      "style": {
        "useImportType": "warn",
        "useConst": "error"
      }
    }
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  }
}
```

Key points:
- `vcs.useIgnoreFile: true` makes Biome respect your `.gitignore`
- The `files.includes` exclusions prevent checking build artifacts
- Customize `linter.rules` to your team's preferences

You can also add test-specific overrides to relax rules in test files:

```json
{
  "overrides": [
    {
      "includes": ["**/__tests__/**", "**/*.test.*", "**/*.spec.*"],
      "linter": {
        "rules": {
          "suspicious": {
            "noExplicitAny": "off"
          },
          "style": {
            "noNonNullAssertion": "off"
          }
        }
      }
    }
  ]
}
```

---

## Step 3: Add `check-types` Script to Every Package and App

Each package/app that contains TypeScript must have a `check-types` script in its own `package.json`. This is critical because each package has its own `tsconfig.json` with different settings (paths, compiler options, includes/excludes).

**Why per-package?** Running `tsc --noEmit` from the root does not work in a monorepo — it would use the root `tsconfig.json` which doesn't know about each package's specific configuration (path aliases, jsx settings, excluded files, etc.).

### For each package/app, add to its `package.json`:

```json
{
  "scripts": {
    "check-types": "tsc --noEmit"
  }
}
```

Example — `packages/api/package.json`:

```json
{
  "name": "api",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "check-types": "tsc --noEmit"
  }
}
```

Example — `packages/chat-service/package.json`:

```json
{
  "name": "chat-service",
  "scripts": {
    "dev": "bun run --hot src/server.ts",
    "check-types": "tsc --noEmit"
  }
}
```

Example — `packages/shared/package.json` (a library with no build step):

```json
{
  "name": "@repo/shared",
  "scripts": {
    "check-types": "tsc --noEmit"
  }
}
```

**Do this for every single package and app that has a `tsconfig.json`.** If a package has no TypeScript (e.g., a config-only package), skip it — Turbo will simply ignore packages that don't have the `check-types` script.

### Also add to root `package.json`:

```json
{
  "scripts": {
    "check-types": "turbo run check-types"
  }
}
```

This allows you to run `bun run check-types` from the root.

---

## Step 4: Register `check-types` Task in Turbo

Add the `check-types` task to your `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "check-types": {
      "dependsOn": ["^check-types"]
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    }
  }
}
```

The `"dependsOn": ["^check-types"]` ensures that if package A depends on package B, B's types are checked first. This respects the dependency graph.

Now you can verify it works:

```bash
bunx turbo check-types
```

You should see output like:

```
• Packages in scope: api, web, chat-service, shared
• Running check-types in 4 packages
api:check-types: $ tsc --noEmit
web:check-types: $ tsc --noEmit
chat-service:check-types: $ tsc --noEmit
shared:check-types: $ tsc --noEmit

 Tasks:    4 successful, 4 total
```

**Fix any type errors before proceeding** — the pre-commit hook will block commits if there are errors.

---

## Step 5: Write the Pre-Commit Hook

Replace the contents of `.husky/pre-commit` with:

```sh
#!/bin/sh

# ──────────────────────────────────────────────
# Step 1: Biome — lint & format staged files
# ──────────────────────────────────────────────

# Collect staged files matching our extensions
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx|json|css)$' || true)

if [ -n "$STAGED_FILES" ]; then
  echo "🔍 Biome: checking staged files..."

  # Auto-fix formatting and safe lint fixes
  echo "$STAGED_FILES" | xargs bunx biome check --write --unsafe 2>/dev/null

  # Re-stage the auto-fixed files so fixes are included in the commit
  echo "$STAGED_FILES" | xargs git add

  # Verify no remaining unfixable errors
  echo "$STAGED_FILES" | xargs bunx biome check
  if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Biome found errors that cannot be auto-fixed. Please fix them manually."
    exit 1
  fi

  echo "✅ Biome: all checks passed"
fi

# ──────────────────────────────────────────────
# Step 2: TypeScript — type-check all packages
# ──────────────────────────────────────────────

echo "🔍 TypeScript: checking types..."
bunx turbo check-types
if [ $? -ne 0 ]; then
  echo ""
  echo "❌ TypeScript type errors found. Please fix them before committing."
  exit 1
fi

echo "✅ TypeScript: all type checks passed"
```

### How the Biome step works:

1. **Collects staged files** — only checks files that are being committed (Added, Copied, Modified), filtered by extension
2. **Auto-fixes** — runs `biome check --write --unsafe` to fix formatting issues and safe lint fixes automatically. The `--unsafe` flag enables auto-fixes for rules marked as unsafe (like import sorting). Stderr is suppressed to keep output clean
3. **Re-stages** — adds the auto-fixed files back to the staging area so the formatting fixes are included in the commit
4. **Verifies** — runs `biome check` again without `--write`. If there are still errors (unfixable ones like actual code issues), the commit is blocked

### How the TypeScript step works:

1. Runs `bunx turbo check-types` which orchestrates `tsc --noEmit` across all packages in parallel
2. Each package uses its own `tsconfig.json`
3. Turbo caches results — if a package hasn't changed, the check is instant
4. If any package has type errors, the commit is blocked

---

## Step 6: Make the Hook Executable

```bash
chmod +x .husky/pre-commit
```

> **Note:** Husky 9.x handles this automatically in most cases, but it's good practice to ensure the file is executable.

---

## Step 7: Add `.turbo` to `.gitignore`

Turbo creates `.turbo/` cache directories inside each package. Add this to your root `.gitignore`:

```gitignore
# caches
.turbo
```

This single entry at the root level covers all `.turbo/` directories in all packages recursively.

---

## Step 8: Verify Everything Works

### Test Biome auto-fix:

```bash
# Intentionally mess up formatting in a file
echo "const   x  =1" >> packages/api/src/test-file.ts
git add packages/api/src/test-file.ts
git commit -m "test"
# → Biome should auto-fix the formatting and commit succeeds
```

### Test Biome blocking:

```bash
# Introduce an unfixable lint error
git add .
git commit -m "test"
# → Should block with "Biome found errors that cannot be auto-fixed"
```

### Test TypeScript blocking:

```bash
# Introduce a type error in any package
echo "const x: number = 'not a number'" >> packages/api/src/bad.ts
git add packages/api/src/bad.ts
git commit -m "test"
# → Should block with "TypeScript type errors found"
```

### Clean run:

```bash
git add .
git commit -m "feat: my feature"
# → Both checks pass, commit succeeds
```

---

## Teammate Onboarding

When a teammate clones the repo:

```bash
git clone <repo-url>
cd <repo>
bun install     # ← This is all they need. Husky installs hooks automatically via "prepare" script.
```

No additional setup required. The pre-commit hook is active immediately.

---

## Troubleshooting

### "bunx: command not found" in the hook

Make sure Bun is in the system PATH. If using a version manager (like `mise` or `asdf`), you may need to add this at the top of `.husky/pre-commit`:

```sh
export PATH="$HOME/.bun/bin:$PATH"
```

### Turbo check-types fails on one package

Run the check individually to see detailed errors:

```bash
cd packages/<failing-package>
bun run check-types
```

### Skipping the hook (emergency only)

```bash
git commit --no-verify -m "hotfix: urgent production fix"
```

Use sparingly — this defeats the purpose of the hooks.

### Hook not running after clone

Ensure `bun install` was run. The `"prepare": "husky"` script in `package.json` installs the Git hooks during install.

### Turbo is slow on first run

Turbo caches results. The first run checks everything; subsequent runs only re-check changed packages. You can inspect the cache with:

```bash
bunx turbo check-types --dry
```

---

## Summary of Changes

| File | Change |
|------|--------|
| Root `package.json` | Added `"prepare": "husky"`, `"check-types": "turbo run check-types"`, `husky` + `@biomejs/biome` in devDependencies |
| `turbo.json` | Added `"check-types"` task with `"dependsOn": ["^check-types"]` |
| `biome.json` | Created at root with formatter, linter, and VCS config |
| `.husky/pre-commit` | Created with Biome auto-fix + TypeScript check steps |
| `.gitignore` | Added `.turbo` |
| Each package's `package.json` | Added `"check-types": "tsc --noEmit"` script |
