# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a **portfolio documentation repository** for スロマップAI (Slo-Map AI), a Next.js + Supabase pachinko/slot store information platform. The actual source code is maintained in a private repository - this public repo contains only documentation, database design specifications, and project metrics for job application purposes.

**Live Site**: https://slo-map.com
**Tech Stack**: Next.js 15.4, React 19, TypeScript 5.0, Supabase (PostgreSQL), Tailwind CSS 3.4

## Repository Structure

```
/
├── README.md              # Main project overview (Japanese)
├── DATABASE_DESIGN.md     # Database schema, RLS policies, optimization strategies
├── CODE_SAMPLES/          # Code snippets and examples (if added)
├── DATABASE_DIAGRAMS/     # ER diagrams and schema visualizations
├── SCREENSHOTS/           # UI screenshots demonstrating features
├── METRICS/               # Performance metrics and analytics
└── docs/                  # Additional technical documentation
```

## Key Architecture Concepts

### 1. Next.js 15 App Router with ISR

The actual application uses Server Components with Incremental Static Regeneration:
- **Top page**: 30-minute revalidation (`revalidate = 1800`)
- **Dynamic routes**: Generated at build time for 95 pages (店舗詳細 pages)
- **SSR**: Supabase queries executed server-side for optimal performance
- **Build time**: 21 seconds for full static generation

### 2. Supabase Architecture

**Database**:
- PostgreSQL with Row Level Security (RLS) on all tables
- UUID primary keys for distributed DB compatibility
- Connection pooling via PgBouncer (max 100 connections)

**Key Tables**:
- `halls`: 店舗マスター (3,000 stores) with geolocation data
- `coverage_events`: 取材イベント (4,009 events initially, consolidated to 3,524)
- `syuzai_masters`: 取材マスター with custom slugs
- `media_masters`: 媒体マスター (87 media outlets)

**Security**:
- RLS policies enforce `is_public = true` for public data
- Server-side only Supabase client (no client-side keys exposed)

### 3. Data Quality Management

**Critical Issue Solved**: Issue #392 - Schema changes causing service outage

**Solution implemented**:
1. TypeScript type auto-generation from Supabase schema
2. Schema change detection in CI/CD pipeline
3. Sentry integration for error monitoring

**Slug Quality System**:
- A-E grading system for URL slug quality
- 485 duplicate entries consolidated (4,009 → 3,524)
- Quality A rating achieved: 92% (up from 70%)

### 4. Performance Optimization

**Database**:
- Materialized views for media rankings (5,000ms → 50ms)
- Partial indexes on `(status, event_date)` for scheduled events
- Haversine distance calculation for geolocation search

**Frontend**:
- Lighthouse scores: Mobile 95/100, Desktop 98/100
- Core Web Vitals: LCP 1.2s, FID 50ms, CLS 0.05
- ISR cache hit rate: 92%

## Development Commands

Since this is a documentation repository with no actual code, there are no build/test commands. However, the actual project uses:

**Build & Development** (reference only):
```bash
npm run dev              # Start Next.js dev server
npm run build            # Production build (21s for 95 pages)
npm run start            # Start production server
npm run lint             # ESLint check (0 errors, 0 warnings)
```

**Type Safety** (reference only):
```bash
npm run generate-types   # Auto-generate TypeScript types from Supabase
npm run schema:check     # Detect breaking schema changes
```

**Pre-commit Hooks** (reference only):
- Husky + lint-staged enforces ESLint and TypeScript checks before commits

## Important Technical Details

### TypeScript Type Generation

The actual project uses automatic type generation to prevent schema drift:

```typescript
// Generated from Supabase schema
export type Database = {
  public: {
    Tables: {
      halls: {
        Row: {
          id: string
          name: string
          prefecture: string
          // ... auto-generated from DB schema
        }
      }
    }
  }
}
```

**Critical**: Never manually edit `src/types/database.ts` - always regenerate from schema.

### Slug Management

Custom slugs use this validation pattern:
- Minimum length: 5 characters
- Format: `^[a-z0-9\-]+$` (lowercase alphanumeric + hyphens only)
- No Japanese characters allowed
- Unique constraint enforced at DB level

**Common slug patterns**:
- Visit events: `{name}-visit` (e.g., `atsuhime-visit`)
- Coverage types: `{media}-{type}-coverage` (e.g., `yutoroslot-jiji-coverage`)

### RLS Policy Patterns

All public-facing queries use these RLS patterns:

```sql
-- Public data only
USING (is_public = true)

-- Active events only
USING (status = 'scheduled' AND event_date >= CURRENT_DATE)

-- Authenticated updates only
USING (auth.uid() IS NOT NULL)
```

### Glassmorphism Design System

The UI uses a unified design pattern called `floating-heavy`:

```css
.floating-heavy {
  background: rgba(255, 255, 255, 0.17);
  backdrop-filter: blur(24px) saturate(120%);
  border: 1px solid rgba(255, 255, 255, 0.25);
}
```

Applied consistently across all components for 100% design uniformity.

## Data Quality Standards

### Slug Quality Grading

- **Grade A** (90-100 points): Optimal length, no issues
- **Grade B** (70-89 points): Minor issues, acceptable
- **Grade C** (50-69 points): Needs improvement
- **Grade D** (0-49 points): Unacceptable, must fix

**Deductions**:
- Too short (<5 chars): -50 points
- Japanese characters: -80 points
- Duplicate: -30 points

### Database Normalization Philosophy

**Partially denormalized for performance**:
- `media_name` stored as string in `coverage_events` (not FK) to avoid JOINs
- `anaba_score` denormalized in `halls` table for fast sorting
- Trade-off: Data consistency vs. query performance (performance wins for read-heavy workloads)

## SEO and Infrastructure

### Domain Configuration

**Critical**: `www.slo-map.com` → `slo-map.com` via 301 redirect (configured in Vercel dashboard, NOT vercel.json)

This solved Search Console "redirect error" issues that prevented indexing.

### Structured Data

Implemented schema.org types:
- `Event` for coverage events
- `BreadcrumbList` for navigation
- `FAQPage` for help sections

All validated with Google Rich Results Test.

## Development Workflow (Reference)

The actual project uses this workflow:

1. **Schema Changes**:
   - Update Supabase schema via dashboard or migrations
   - Run `npm run generate-types` to sync TypeScript types
   - Run `npm run schema:check` to detect breaking changes

2. **Data Quality**:
   - Run slug quality checks before deployment
   - Verify no Grade D slugs exist
   - Check for duplicates using `SELECT custom_slug, COUNT(*) GROUP BY custom_slug HAVING COUNT(*) > 1`

3. **Pre-deployment**:
   - ESLint must show 0 errors, 0 warnings
   - TypeScript strict mode must pass
   - Build must complete in <30 seconds

## AI Development Tools Used

The actual project leveraged Claude Code v2.0.0 with these specialized agents:

- `slug-fixer`: Automated slug quality improvements
- `sentry-analyzer`: Error log analysis and fix suggestions
- `api-performance-optimizer`: N+1 query detection and resolution
- `responsive-design-validator`: Cross-device UI testing
- `build-checker`: TypeScript/ESLint/build validation

**Impact**: 92% development time reduction, 69% quality metric improvement (measured).

## Important Notes

1. **This is a documentation-only repository** - no actual source code is present
2. **Do not create package.json** or other project scaffolding files here
3. **Focus on documentation improvements** when working in this repo
4. The actual codebase is in a private repository for security reasons
5. All metrics and code examples in documentation are from the real production system

## Database Performance Targets

When analyzing or documenting database queries:

- **Simple queries** (single table): <100ms
- **JOIN queries** (2-3 tables): <200ms
- **Complex aggregations**: <500ms (use Materialized Views if exceeded)
- **Geolocation searches**: <350ms for 3,000 stores within 50km radius

Use `EXPLAIN ANALYZE` to verify query plans stay within these targets.

## Contact

For questions about this portfolio project:
- **Portfolio Site**: https://slo-map.com
- **GitHub**: [@dataanalytics2020](https://github.com/dataanalytics2020)
