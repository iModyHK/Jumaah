# Security policy

Jumaah runs inside mosques and holds staff accounts, khutbah texts and translation-provider API keys. Please report anything that could expose those.

## Reporting a vulnerability

- Preferred: GitHub → **Security** tab → **Report a vulnerability** (private advisory).
- Or email **malkurbi5@gmail.com** with "Jumaah security" in the subject.

Please include the version (`package.json` version or the Docker image tag), steps to reproduce, and the impact you see. Do not open a public issue for security problems.

You will get an acknowledgement within 7 days. Fixes are released as a new image tag and noted in the GitHub release.

## Scope

- The API (`apps/api`), the admin, imam and display apps, the sync worker, and the edge/cloud Docker Compose setups.
- Authentication, tenant isolation (RLS), stored provider keys, display tokens and sync keys.

Out of scope: vulnerabilities in third-party translation providers themselves, and issues that require an already-compromised host.

## Supported versions

Only the latest release on `main` receives fixes.
