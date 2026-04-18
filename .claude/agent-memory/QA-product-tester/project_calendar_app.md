---
name: Personal Calendar App — Project Context
description: Key facts about the personal calendar app running at localhost:3000, including known issues and test account details.
type: project
---

App URL: http://localhost:3000
Stack: Next.js 16.1.7 with Turbopack, React, TanStack Query
Test account: micosil97@gmail.com (Francisco Marquez Soltero)
Google OAuth client ID: 647748873783-5lqcruraab6pl0bmf4kv1315g97a97qp.apps.googleusercontent.com

**Known issue (as of 2026-03-17):** React hydration mismatch on the root `<html>` element.
- The server renders `suppressHydrationWarning="true"` and no `data-lt-installed` attribute.
- The client picks up `data-lt-installed="true"` (injected by a browser extension — likely LanguageTool).
- Source: `src/app/layout.tsx` line 28, `RootLayout` component.
- Severity: Minor in dev; not a real app bug — caused by a browser extension modifying the DOM before React hydrates. The `suppressHydrationWarning` prop is already present on `<html>`, which is the correct mitigation. No production impact expected.

**Why:** The browser running the tests has LanguageTool (or similar) extension installed which injects `data-lt-installed` into the `<html>` tag before React hydrates, causing a mismatch that Next.js dev overlay surfaces as a Console Error.

**How to apply:** When this error appears in future test runs, confirm it is still extension-induced (not a real app regression) before escalating.
