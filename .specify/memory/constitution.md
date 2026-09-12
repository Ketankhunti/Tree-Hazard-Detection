# Tree Hazard Detection Constitution

## Core Principles

### I. MVP-First (NON-NEGOTIABLE)
This is a hackathon MVP with a ~4 hour build window. Prioritize a polished working demo over completeness. Ship a functional, visually impressive application that runs immediately after `npm install && npm run dev`. No login, no API keys, no external backend dependencies. All data is local mock data. All scoring runs in the browser.

### II. Deterministic Explainable Scoring
The prioritization engine must be deterministic and fully explainable. Every score component (Danger 50%, Wait Time 25%, Location Impact 15%, Human Review 10%) must produce a 0–100 value with a clear, auditable trail. The reasoning text must be generated from actual detected factors — never hardcoded independently of the scoring system. The engine must be structured so an LLM/API can replace the deterministic classifier in the future without changing the UI layer.

### III. Separation of Concerns
Strict separation between: mock data (`data/`), scoring engine (`lib/`), types/interfaces (`types/`), components (`components/`), and pages (`pages/`). Scoring logic must never be duplicated inside components. The scoring engine must be independently testable. Reusable components (PriorityBadge, ScoreBar, SummaryCard, ComplaintTable, FilterBar, HazardTag, AssessmentBreakdown, HazardPoster) must not contain business logic.

### IV. Government-Grade UX
The UI must feel like a serious municipal operations tool — not a generic SaaS app. White background, light gray panels, subtle borders, dark text, restrained color use, professional typography, data-dense layout. No excessive gradients, shadows, rounded cards, or cartoonish illustrations. High contrast for accessibility. Responsive across desktop, tablet, and mobile.

### V. Print-Ready Field Assessment
The Hazard Assessment Poster must print cleanly on US Letter (8.5 × 11 inch) portrait paper with proper margins and no clipped content. Print CSS must hide all non-poster content (navigation, dashboard, filters, buttons, map). The poster must include the mandatory disclaimer: "Automated triage assessment — final determination requires qualified arborist inspection."

## Technology Stack

- **Framework**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Data**: Local mock data (20 realistic Halifax tree complaints)
- **Scoring**: Deterministic local engine (no API calls)
- **No external dependencies**: No auth, no database, no backend server, no API keys

## Development Workflow

1. Build mock data first (20 complaints with varied severity)
2. Implement and unit-test the scoring engine independently
3. Build reusable UI components
4. Compose dashboard and detail pages
5. Add print CSS and poster component
6. Verify: sorting, filtering, detail navigation, scoring, hazard detection, Unsure detection, summary stats, print mode

## Governance

- This constitution supersedes all other practices for this project
- The system must NOT claim a tree is definitely dangerous — it is a prioritization and triage tool
- "Unsure" means insufficient information for human review, NOT the same as "dangerous"
- If a complaint is both high-scoring and uncertain, display BOTH priority and review status
- All implementation decisions not specified in the prompt should be resolved with the most sensible choice rather than asking for clarification

**Version**: 1.0.0 | **Ratified**: 2026-09-12 | **Last Amended**: 2026-09-12
