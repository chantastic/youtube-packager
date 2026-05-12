# Build Modern AI SaaS with WorkOS

## Summary

This course keeps the main path fully practical and uses optional concept videos only when a practical lesson would otherwise lose momentum.

Each lesson should let the learner move in three directions:

- Forward to the next practical lesson
- Backward to review what they just completed
- Out into concept space when they need supporting context before proceeding

## Main Practical Course

1. **Install AuthKit in the app with the WorkOS CLI**
   Need: We need authentication in place quickly without spending a whole lesson on boilerplate.
   Build: Use the WorkOS CLI to install AuthKit, configure the app, and get sign-in/sign-out working.
   Backward: What the CLI actually gave us.
   Forward: Now that users can sign in, we need a real organization-based collaboration model.
   Pop-out: None.

2. **Invite teammates, handle unclaimed users, and claim access**
   Need: A B2B app needs organization membership, not just generic sign-in.
   Build: Create an invitation flow for a user who does not yet have an account, then show them claiming access by accepting the invite and joining the org.
   Backward: Invitation lifecycle, membership lifecycle, and what "claimed" really means in product terms.
   Forward: Frontend auth is not enough; the backend needs durable user and organization state.
   Pop-out: **Why org-first modeling matters for modern SaaS**.

3. **Sync users and organizations into Convex with `@convex/workos`**
   Need: The backend needs durable auth state for ownership, workflows, and authorization.
   Build: Use the Convex WorkOS component to sync users and org state into Convex using the durable integration path.
   Backward: What got persisted, what stayed in WorkOS, and why this is the right boundary.
   Forward: The app can identify users and orgs, but it still cannot safely act on third-party APIs.
   Pop-out: **Why Events API thinking beats raw webhooks**.

4. **Connect third-party services with Pipes**
   Need: The app needs provider access without owning OAuth token storage, refresh logic, or broad credentials.
   Build: Connect a provider with Pipes and use delegated access inside app workflows.
   Backward: What Pipes owns vs what the app owns.
   Forward: Now we can connect providers, but we still need to control which paid customers get which capabilities.
   Pop-out: None.

5. **Gate paid features with Stripe entitlements**
   Need: Feature access should come from billing truth, not duplicated plan logic in app code.
   Build: Connect Stripe entitlements, read entitlements from the access token, and gate premium functionality accordingly.
   Backward: Pricing plans vs feature access, and why entitlements belong close to auth.
   Forward: Some premium features also require org-owned credentials, not user-delegated access.
   Pop-out: None.

6. **Store org-level secrets with Vault**
   Need: Some integrations and AI capabilities need tenant-owned secrets, not a user's delegated OAuth connection.
   Build: Store and retrieve organization-scoped encrypted data with Vault behind a narrow application boundary.
   Backward: User-delegated access vs org-owned secrets.
   Forward: Now that orgs have powerful configuration, not every member should be allowed to manage it.
   Pop-out: None.

7. **Add admin permissions with RBAC**
   Need: Not every org member should manage billing, integrations, or secrets.
   Build: Assign org-scoped roles and permissions and enforce them in the app.
   Backward: How coarse-grained authorization changes the app's control surfaces.
   Forward: Org-wide roles work until a specific resource needs different access rules.
   Pop-out: None.

8. **Add resource-specific authorization with FGA**
   Need: Roles are too coarse once access depends on the specific workspace, event, video, or workflow.
   Build: Model resources, assign roles to organization memberships on those resources, and enforce access checks.
   Backward: Resource hierarchy, inheritance, and discovery.
   Forward: Human users are covered; now AI clients need secure access to the same system.
   Pop-out: **When RBAC stops being enough**.

9. **Secure the app's MCP server with AuthKit**
   Need: AI tools and agents need OAuth-based, scoped access to tools and resources.
   Build: Use AuthKit as the authorization server for an MCP server and protect the MCP surface correctly.
   Backward: What changed when the client became an agent instead of a browser.
   Forward: Capstone.
   Pop-out: **How MCP auth actually works**.

## Concept Pop-Out Library

1. **Why Org-First Modeling Matters for Modern SaaS**
   Use from Lesson 2.

2. **Why Events API Thinking Beats Raw Webhooks**
   Use from Lesson 3.

3. **When RBAC Stops Being Enough**
   Use from Lesson 8.

4. **How MCP Auth Actually Works**
   Use from Lesson 9.

## What Not To Split Out

- Pipes should stay practical.
- Stripe entitlements should stay practical.
- Vault should stay practical.
- RBAC should stay practical.

## Course Rules

- Every practical lesson should stand on its own.
- Every practical lesson should still create pressure for the next one.
- Concept videos should exist only when they protect the practical flow.
- The course should stay product-practical, not architecture-first.

## Grounding Sources

- WorkOS CLI / AI Installer: https://workos.com/docs/authkit/cli-installer
- AuthKit install flow: https://workos.com/docs/authkit/landing/install-using-the-workos-cli
- Invitations: https://workos.com/docs/authkit/invitations
- Users and organizations: https://workos.com/docs/user-management/users-organizations/organizations
- Events: https://workos.com/docs/events
- Pipes: https://workos.com/docs/reference/pipes
- Stripe entitlements: https://workos.com/docs/user-management/add-ons/stripe-entitlements
- Vault quick start: https://workos.com/docs/vault/quick-start
- RBAC overview: https://workos.com/docs/rbac
- RBAC integration: https://workos.com/docs/rbac/integration
- FGA query language: https://workos.com/docs/fga/query-language
- FGA quick start: https://workos.com/docs/fga/quick-start
- MCP with AuthKit: https://workos.com/docs/authkit/mcp
