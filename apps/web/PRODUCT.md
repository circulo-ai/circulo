# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Teams and organization members who use a shared AI workspace to ask questions, coordinate specialized agents, and review generated artifacts.

## Product Purpose

Circulo is a multi-tenant AI workspace. A user works inside an organization, creates a conversation, selects organization-owned agents, and sends a request. Durable orchestration classifies the request, plans agent execution, runs agents, persists messages and artifacts, and streams progress and the final response back to the chat UI.

## Positioning

Circulo combines a shared team workspace with organization-owned AI agents and durable, observable orchestration so work can continue across conversations, artifacts, and recoverable workflow runs.

## Operating Context

The primary workflow is authenticated, organization-scoped chat. Users may manage agents, knowledge, memories, automations, invitations, settings, and billing-related plans from the web app.

## Capabilities and Constraints

- The web app is a Next.js App Router application in a Bun/Turborepo monorepo.
- Authentication and organization membership are required for organization data routes.
- Chat streams include agent progress and final responses, with artifacts such as text, code, sheets, and images.
- New UI should preserve accessible keyboard, focus, loading, error, empty, and responsive states.
- Business logic should remain outside presentational JSX where practical.

## Brand Commitments

- Product name: Circulo AI.
- Existing product language describes a “Circle of AI powered minds.”
- Existing visual implementation and supplied logo/assets are the source of truth for product content unless the user explicitly changes them.

## Evidence on Hand

- Product and architecture description: repository root `README.md`.
- Existing routes and UI: `apps/web/src/app` and `apps/web/src/components`.
- Chat background and product assets: `apps/web/public`.
- No supplied testimonials, customer proof, or benchmark claims; future UI must not fabricate them.

## Product Principles

1. Make organization-scoped AI work understandable and recoverable.
2. Keep the chat and agent workflow legible while work is in progress.
3. Make generated artifacts easy to inspect and act on.
4. Favor predictable, accessible interaction patterns across the workspace.

## Accessibility & Inclusion

The web app should meet WCAG AA expectations for semantic structure, keyboard access, focus visibility, readable contrast, labels, responsive behavior, and reduced-motion alternatives.
