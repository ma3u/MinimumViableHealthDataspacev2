# ADR-004: Next.js 14 as Unified Frontend

**Status:** Accepted
**Date:** 2025-07-25
**Supersedes:** —

## Context

The JAD ecosystem includes three separate Angular frontends (Aruba management UI, Fraunhofer data dashboard, Redline MVD) each covering partial functionality. Maintaining three frameworks with different build pipelines, auth mechanisms, and deployment strategies created unnecessary complexity. The project needed a single frontend that could serve all 7 persona roles while also supporting static export for GitHub Pages deployment.

## Decision

Use Next.js 14 (App Router) as the single unified frontend, consolidating all three Angular UIs:

- 16 pages covering all persona journeys (patient, researcher, data holder, HDAB, admin, trust center)
- 36 co-located API routes for Neo4j proxy, auth, and graph endpoints
- NextAuth.js for unified authentication with Keycloak OIDC
- Static export mode (`NEXT_PUBLIC_STATIC_EXPORT=true`) with mock JSON fixtures for GitHub Pages
- Dark-themed UI with role-based navigation and Neo4j knowledge graph explorer

## Consequences

### Positive

- Single build pipeline and deployment target
- Unified authentication flow via NextAuth.js
- Static export enables zero-cost GitHub Pages hosting for demos
- App Router provides server components by default, improving performance
- Co-located API routes simplify the development experience

### Trade-offs

- Required rewriting ~15 Angular components to React/TypeScript
- Static export disables API routes — requires mock fixtures and `NEXT_PUBLIC_STATIC_EXPORT` guards
- Team members familiar with Angular needed to learn React/Next.js patterns

## References

- [Full details in planning document](../planning-health-dataspace-v2.md)
- UI source: `ui/src/app/`
- Static mock fixtures: `ui/public/mock/`
- Auth configuration: `ui/src/lib/auth.ts`
