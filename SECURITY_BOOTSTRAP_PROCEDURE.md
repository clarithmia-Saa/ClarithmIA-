# Security bootstrap and multi-tenant onboarding

## Current state in this repository

There is no application bootstrap flow in the checked-in code that creates the first organization and the first administrator automatically.

The repository contains the tenant model and RLS enforcement, but not a public “first user” or “first org” route. The current enforcement model assumes:

- the Supabase project already contains `public.organizations` and `public.organization_members` rows;
- the backend resolves tenant membership from `organization_members` before allowing writes;
- the caller includes `x-organization-id` when the authenticated user belongs to more than one organization;
- the `service_role` remains server-side only and never in the browser.

## Safe, restricted bootstrap procedure (recommended)

1. Create the first organization manually in the Supabase SQL or admin console.
   - Insert a real organization record, not a placeholder/default value.
   - Use a generated UUID or deterministic organization ID chosen by the admin console, not a public default string.

2. Create the first administrator manually in the same trusted environment.
   - Insert a row in `public.organization_members` with `user_id = auth.uid()` for the real user who is bootstrapping the tenant.
   - Set the role to `admin` only for the admin account explicitly created by the trusted operator.

3. Require a server-side bootstrap function only for a trusted operator path.
   - If an application bootstrap is needed, it should be a backend-only function that requires a privileged internal secret and must be executed by an administrator or an ops workflow.
   - It must never be exposed as an unauthenticated or public endpoint.

4. Prohibit implicit tenant assignment.
   - Do not create a row with `organization_id = 'default'`.
   - Do not assign a user to a tenant based on a JWT claim alone.
   - Do not allow a public endpoint to create orgs or claims in the browser.

5. Audit the initial membership.
   - Validate that the first admin is the only admin for the new tenant.
   - Verify that every subsequent member is granted access only through an explicit membership record in `organization_members`.

## Production guardrails

- Keep `service_role` out of the frontend and out of `VITE_*` variables.
- Keep the bootstrap path behind a server-only secret or an operational admin console.
- Require `x-organization-id` whenever a user has multiple memberships.
- Maintain an audit log of org creation and admin assignment.
- Remove or lock down any public route that can create organizations or assign roles.
