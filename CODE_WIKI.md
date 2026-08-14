# Code Wiki

## 1. Project Overview

This repository is a Vite + React + TypeScript single-page application for counseling and service-assignment operations.
It manages:

- service users
- support workers
- counseling records
- termination documents
- handover documents
- worker-to-user matching
- spreadsheet-based bulk import workflows

The application is frontend-only in this repository. It talks directly to Firebase Authentication and Firestore from the browser, and also uses the Kakao geocoding API for address lookup.

## 2. Tech Stack

### Core

- React 18
- TypeScript
- Vite
- React Router (`HashRouter`)
- Firebase Auth
- Firebase Firestore

### UI

- Tailwind CSS
- shadcn/ui
- Radix UI
- Sonner toast UI
- Recharts for dashboard charts

### Utilities

- `xlsx` for spreadsheet parsing/import/export
- Vitest + Testing Library for tests

## 3. High-Level Architecture

### Runtime Flow

1. `src/main.tsx` mounts the React application.
2. `src/App.tsx` initializes global providers and the authenticated application shell.
3. `useAuth()` waits for Firebase authentication state.
4. If the user is not authenticated, the app renders `src/pages/Login.tsx`.
5. If authenticated, the app renders the routed application inside `src/components/Layout.tsx`.
6. Page-level modules load Firestore collections through `useCollection()` from `src/hooks/useFirestore.ts`.
7. Domain logic in `src/lib/*` transforms, validates, synchronizes, and scores business data.

### Architectural Layers

- `src/pages`
  - Route-level screens and workflow orchestration
- `src/components`
  - Shared UI and reusable business UI widgets
- `src/components/ui`
  - shadcn/Radix design-system components
- `src/hooks`
  - Stateful logic for auth, Firestore subscriptions, viewport state, and toasts
- `src/lib`
  - Domain and integration logic
- `src/types`
  - Shared domain model definitions
- `src/test`
  - Unit tests and test setup

## 4. Repository Structure

```text
src/
  App.tsx
  main.tsx
  components/
    Layout.tsx
    ErrorBoundary.tsx
    BulkUploadDialog.tsx
    MultiEntitySelect.tsx
    WeeklySchedulePicker.tsx
    ui/
  hooks/
    useAuth.ts
    useFirestore.ts
    use-mobile.tsx
    use-toast.ts
  lib/
    firebase.ts
    collectionNames.ts
    assignments.ts
    matching.ts
    bulkUpload.ts
    kakao.ts
    utils.ts
  pages/
    Dashboard.tsx
    UserManagement.tsx
    WorkerManagement.tsx
    Matching.tsx
    Counseling.tsx
    Terminations.tsx
    Handovers.tsx
    Login.tsx
    NotFound.tsx
  types/
    index.ts
  test/
    bulkUpload.test.ts
    dateSorting.test.ts
```

## 5. Application Shell

### `src/main.tsx`

Responsibility:

- React entrypoint
- creates the root application mount
- renders `App`

### `src/App.tsx`

Responsibility:

- creates the top-level `QueryClient`
- renders global UI providers
- gates the application by authentication state
- configures route definitions
- wraps route elements with `ErrorBoundary`

Important notes:

- Routing uses `HashRouter`, which is useful for static hosting environments.
- React Query is present as a provider, but the main data access pattern in this project is custom Firestore hooks rather than `useQuery`.

### `src/components/Layout.tsx`

Responsibility:

- global navigation
- mobile/desktop layout switching
- logout entrypoint
- shared page frame

### `src/components/ErrorBoundary.tsx`

Responsibility:

- catches rendering errors in page boundaries
- prevents a single route crash from taking down the entire application UI

## 6. Routing and Pages

### Route Map

- `/` -> `Dashboard`
- `/users` -> `UserManagement`
- `/workers` -> `WorkerManagement`
- `/matching` -> `Matching`
- `/counseling` -> `Counseling`
- `/terminations` -> `Terminations`
- `/handovers` -> `Handovers`
- `*` -> `NotFound`

### `Dashboard.tsx`

Responsibility:

- reads users, workers, counseling, termination, and handover collections
- computes summary metrics
- shows recent activity and chart-based summaries
- surfaces match recommendations

Key behavior:

- follows safe data-loading patterns by normalizing collection data to arrays
- derives metrics only after loading guards

### `UserManagement.tsx`

Responsibility:

- create, edit, view, filter, and import service users
- manage assigned workers
- trigger address geocoding
- coordinate synchronization to related worker documents

Key functions and workflows:

- `handleSave`
  - saves user updates to Firestore
  - keeps compatibility fields in sync
  - calls assignment synchronization helpers
- `handleBulkConfirm`
  - imports spreadsheet data using the bulk-upload pipeline
- map/address utilities
  - call Kakao geocoding to enrich location data

### `WorkerManagement.tsx`

Responsibility:

- create, edit, view, filter, and import support workers
- manage assigned users
- compute worker status and experience display data
- synchronize reverse assignments back to service users

Key functions and workflows:

- `handleSave`
  - persists worker changes
  - updates paired legacy/new schema fields
  - synchronizes user assignment links
- `handleBulkConfirm`
  - imports spreadsheet worker data

### `Matching.tsx`

Responsibility:

- filters waiting users and workers
- calculates match scores
- presents ranked worker recommendations for a selected user

Key functions and workflows:

- uses `matchUserWithWorkers()` from `src/lib/matching.ts`
- supports selecting a user from route/query context
- recalculates matches as filters or source data change

### `Counseling.tsx`

Responsibility:

- create and manage counseling records
- connect counseling entries to users or workers
- support document-style output/printing flows

### `Terminations.tsx`

Responsibility:

- manage termination documents
- print official termination paperwork
- write termination outcomes back to related user records

Key side effects:

- updates contract status
- updates termination reason
- updates resignation/end dates

### `Handovers.tsx`

Responsibility:

- manage handover documents when assigned workers change
- print handover paperwork
- update user assignment state
- propagate changes to worker documents using assignment sync helpers

### `Login.tsx`

Responsibility:

- email/password login UI
- invokes `useAuth().login()`

### `NotFound.tsx`

Responsibility:

- fallback route for unknown paths

## 7. Data Access Layer

## `src/hooks/useAuth.ts`

Responsibility:

- subscribe to Firebase auth state
- expose `user`
- expose `loading`
- expose `login(email, password)`
- expose `logout()`

This hook is the auth gate for the entire application.

## `src/hooks/useFirestore.ts`

Responsibility:

- central Firestore collection subscription hook
- auth-gated realtime reads
- collection normalization for users and workers
- local cache fallback via `localStorage`
- generic create/update/delete helpers
- user-facing Firestore error mapping

Key exported API:

- `getFirestoreErrorMessage(err)`
- `useCollection<T>(collectionName, constraints?)`

Important behavior:

- uses Firestore realtime listeners (`onSnapshot`)
- waits for auth state before reading data
- caches collection results locally
- falls back to cached data on load errors
- normalizes legacy and new field shapes before exposing data

This hook is one of the most important pieces of the repository because nearly every page depends on it.

## 8. Domain and Integration Modules

## `src/lib/firebase.ts`

Responsibility:

- initialize Firebase app
- expose Firestore database instance
- expose Firebase auth instance
- re-export commonly used Firestore and Auth helpers

This file is the shared integration boundary for Firebase usage across the app.

## `src/lib/collectionNames.ts`

Responsibility:

- define collection name constants
- prevent string duplication and typo-prone collection access

Important rule:

- pages and libraries should use these constants instead of hard-coded collection names

## `src/lib/assignments.ts`

Responsibility:

- normalize service user documents
- normalize worker documents
- format assigned counterpart display values
- synchronize many-to-many assignment data between users and workers
- preserve compatibility between legacy and newer schema fields

Key functions:

- `normalizeServiceUser(raw)`
- `normalizeWorker(raw)`
- `formatHelperList(user)`
- `formatUserList(worker)`
- `buildHelperArraysFromIds(...)`
- `buildUserArraysFromIds(...)`
- `syncUserToWorkers(...)`
- `syncWorkerToUsers(...)`

Why it matters:

- this repository keeps mirrored assignment data on both sides of the relationship
- incorrect updates can leave Firestore documents inconsistent
- the synchronization helpers are the safe path for assignment mutations

## `src/lib/matching.ts`

Responsibility:

- calculate match scores between one service user and candidate workers

Key function:

- `matchUserWithWorkers(user, workers)`

Scoring factors include:

- schedule overlap
- region/location compatibility
- preferred support alignment
- rejection history penalties

This file is the central matching engine and should remain the single place where scoring rules are maintained.

## `src/lib/bulkUpload.ts`

Responsibility:

- parse spreadsheet files and pasted rows
- normalize headers and cell values
- convert raw rows into domain entities
- sanitize data for Firestore
- batch upsert entities into Firestore

Key functions:

- `parseSpreadsheetFile(...)`
- `parsePasteData(...)`
- `buildHeaderMap(...)`
- `normalizeDateCell(...)`
- `rowToServiceUser(...)`
- `rowToWorker(...)`
- `rowsToEntities(...)`
- `sanitizeForFirestore(...)`
- `upsertByNamePhoneBatch(...)`

Why it matters:

- this is the import backbone for user and worker bulk registration
- it also handles compatibility payloads and batched writes

## `src/lib/kakao.ts`

Responsibility:

- geocode addresses using the Kakao API
- calculate geographic distance

Key functions:

- `geocodeAddress(address)`
- `calculateDistance(lat1, lng1, lat2, lng2)`

## `src/lib/utils.ts`

Responsibility:

- Tailwind class merge helper
- date normalization helper for safe sorting

Key functions:

- `cn(...inputs)`
- `getComparableDateValue(value)`

## 9. Shared Components

### `BulkUploadDialog.tsx`

Responsibility:

- generic bulk import dialog UI
- previews parsed entities before import
- hands confirmed rows to page-level import logic

### `MultiEntitySelect.tsx`

Responsibility:

- reusable multi-selection UI for cross-entity assignments

### `WeeklySchedulePicker.tsx`

Responsibility:

- reusable weekly schedule input UI used by user/worker forms

### `components/ui/*`

Responsibility:

- reusable design-system primitives
- thin wrappers around shadcn/Radix components

These files are infrastructure rather than business logic. Most documentation effort should focus on `pages`, `hooks`, `lib`, and `types`.

## 10. Domain Model

All main data contracts are defined in `src/types/index.ts`.

### Main interfaces

- `WeeklySchedule`
  - repeating availability/schedule shape
- `ServiceUser`
  - core service-user profile and assignment state
- `Worker`
  - support-worker profile, availability, preferences, and assignment state
- `CounselingRecord`
  - counseling event/document record
- `TerminationDocument`
  - termination workflow document
- `HandoverDocument`
  - handover/takeover workflow document
- `MatchResult`
  - ranked worker result and score breakdown
- `MatchingHistoryRecord`
  - persisted record of matching activity

### Shared constants

- `VOUCHER_HOURS`
- `DISABILITY_TYPES`
- `SUPPORT_TYPES`
- `ENVIRONMENT_TAGS`
- `WORKER_REJECTION_TYPES`
- `EXPERIENCE_OPTIONS`
- `TERMINATION_REASONS`

These definitions are shared across forms, filters, imports, matching, and printed documents.

## 11. Data Integrity Rules

This repository uses a mixed legacy/new Firestore schema. Compatibility must be preserved.

### Paired fields that must stay synchronized

- service user gender:
  - `gender`
  - `txtUSex`
- worker gender:
  - `gender`
  - `txtHSex`
- termination reason:
  - `terminationReason`
  - `txtUMemostop`

### Assignment mirroring

The app maintains many-to-many assignment links on both sides.

- user side:
  - `assignedHelperIds`
  - `assigned_workers`
- worker side:
  - `assignedUserIds`
  - `assigned_users`

Correct update path:

- use `syncUserToWorkers(...)` when user-side assignment changes originate from a user workflow
- use `syncWorkerToUsers(...)` when worker-side assignment changes originate from a worker workflow

## 12. Dependency Relationships

### Internal Dependency Flow

```text
main.tsx
  -> App.tsx
    -> useAuth.ts
    -> Layout.tsx
    -> pages/*
      -> hooks/useFirestore.ts
        -> lib/firebase.ts
        -> lib/assignments.ts
      -> lib/matching.ts
      -> lib/bulkUpload.ts
      -> lib/kakao.ts
      -> types/index.ts
      -> components/*
```

### External Dependency Flow

- browser UI
  - React + React Router + Tailwind + shadcn/Radix
- authentication
  - Firebase Auth
- data storage
  - Firestore realtime subscriptions and writes
- location lookup
  - Kakao geocoding API
- import/export
  - `xlsx`
- charts
  - Recharts

## 13. Testing

Test tooling:

- Vitest
- jsdom
- Testing Library

Current test coverage focuses on:

- spreadsheet row mapping
- date normalization/sorting utility behavior
- placeholder smoke testing

Test files:

- `src/test/bulkUpload.test.ts`
- `src/test/dateSorting.test.ts`
- `src/test/example.test.ts`

Notable current gaps:

- auth hook behavior
- Firestore hook behavior
- matching score logic
- assignment synchronization
- page rendering and critical workflows
- Kakao integration behavior

## 14. How to Run the Project

### Prerequisites

- Node.js
- npm

### Install

```bash
npm install
```

If dependency resolution fails in a clean environment, CI indicates this project may need:

```bash
npm ci --legacy-peer-deps
```

### Start Development Server

```bash
npm run dev
```

The Vite config binds the dev server to port `8080`.

### Build

```bash
npm run build
```

Development-mode build:

```bash
npm run build:dev
```

### Preview Production Build

```bash
npm run preview
```

### Run Tests

```bash
npm test
```

Watch mode:

```bash
npm run test:watch
```

### Lint

```bash
npm run lint
```

## 15. Deployment

Deployment is configured through GitHub Actions in `.github/workflows/deploy.yml`.

Observed characteristics:

- runs on pushes to `main`
- installs dependencies with npm
- builds the Vite app
- deploys static output to GitHub Pages

Because the app uses `HashRouter`, it is compatible with static hosting without server-side route rewriting.

## 16. Extension Guide

### Adding a new page

1. create the page component in `src/pages`
2. add the route in `src/App.tsx`
3. add navigation entry in `src/components/Layout.tsx`
4. use `useCollection()` or library helpers rather than duplicating data-access logic

### Adding a new Firestore collection

1. define a constant in `src/lib/collectionNames.ts`
2. define or extend related types in `src/types/index.ts`
3. consume it through `useCollection()`
4. add normalization if compatibility handling is required

### Adding new matching rules

1. modify `src/lib/matching.ts`
2. keep score logic centralized
3. validate effects in `Matching.tsx` and any dashboard match summaries

### Adding import fields

1. update parsing and row-mapping logic in `src/lib/bulkUpload.ts`
2. preserve compatibility fields where needed
3. verify the user and worker management pages still generate correct import/export shapes

## 17. Recommended Reading Order

For new contributors, the fastest path to understanding the codebase is:

1. `src/App.tsx`
2. `src/components/Layout.tsx`
3. `src/hooks/useAuth.ts`
4. `src/hooks/useFirestore.ts`
5. `src/types/index.ts`
6. `src/lib/assignments.ts`
7. `src/lib/matching.ts`
8. `src/lib/bulkUpload.ts`
9. `src/pages/UserManagement.tsx`
10. `src/pages/WorkerManagement.tsx`
11. `src/pages/Matching.tsx`
12. `src/pages/Dashboard.tsx`

## 18. Summary

This codebase is best understood as a Firestore-driven operations console with three critical cores:

- realtime collection access through `useFirestore`
- schema compatibility and assignment integrity through `assignments.ts`
- business decision support through `matching.ts` and the workflow pages

If those modules remain consistent, the rest of the application stays relatively easy to evolve.
