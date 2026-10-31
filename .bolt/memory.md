# Project memory

## Product intent & audience

- Project is a Vite + React starter, currently a blank canvas awaiting a specific product definition.
- User communicates in Arabic (Egyptian dialect); likely target audience may be Arabic-speaking — to confirm.
- User referenced a Lovable preview app, suggesting intent to replicate or adapt an existing design/app.

## Brand personality & voice

- No explicit brand established yet.
- User's communication style is informal Egyptian Arabic; UI copy language/tone not yet decided.

## Visual design & UX direction

- Authoritative design instructions exist in `.bolt/prompt` (beautiful, production-worthy, Tailwind CSS, lucide-react icons, `@/` path alias) — not restated here.
- Specific visual direction pending: user attempted to share a Lovable preview as a design reference but the URL is inaccessible (requires auth; external browsing unavailable).
- No color palette, typography, layout, or component preferences inferred yet beyond the global prompt.

## Decisions, constraints & rationale

- Framework: Vite + React with JSX.
- No UI theme packages or icon libraries beyond Tailwind CSS and lucide-react (per `.bolt/prompt`).
- `@/` path alias maps to `src/`.
- External/preview URLs (e.g., Lovable) cannot be accessed for reference; need user-provided descriptions, screenshots, or specs.

## Open questions & assumptions

- What is the intended product/app to build? (User's message was incomplete/unclear.)
- Does the user want to replicate the Lovable preview app, or use it as inspiration?
- What does the referenced app look like and what features does it have? (Cannot access the preview URL.)
- Should the UI be in Arabic, English, or bilingual? RTL support needed?
- Any specific pages, routes, or core features required?