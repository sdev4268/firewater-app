# Firewater Design Basis Tool — Web Application
## Project Metadata v3 (Confirmed Stack)

**This is the handoff document for the web version.**
**Paste this entire file into a new chat to resume development at any phase.**

---

## What This Tool Is

A **web application** that standardises how Active Fire Protection (AFP) Design Basis
documents are created for petroleum / petrochemical engineering projects.

Engineers at consulting firms (e.g. EIL) currently create these documents manually in Word,
leading to broken numbering, inconsistent values, no enforcement of standard design values,
and formatting errors. This tool replaces that entire manual process.

The engineer fills in a structured web form, configures which sections apply to their project,
and clicks Generate — the app produces a fully formatted, correctly numbered Word (.docx)
document matching the EIL/BPCL reference standard exactly.

---

## Version History

| Version | Platform | Status |
|---------|----------|--------|
| v1 Beta | Python + Tkinter + SQLite + python-docx (desktop app) | ✅ Complete, archived |
| v2 Web  | Node.js + Express + PostgreSQL + React (this document) | 🔨 Building now |

The desktop beta validated the entire domain model — section tree, numbering engine,
value resolution, revision tracking, and Word generation. All logic carries over.
The web version is a clean rebuild of the delivery layer, not a redesign of the domain.

---

## Confirmed Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend runtime | **Node.js** | Server-side JavaScript — matches company stack |
| Backend framework | **Express.js** | HTTP server, routing, middleware |
| ORM (DB translator) | **Prisma** | Schema-first, type-safe DB access. Oracle-compatible when migrating to company infra |
| Database (dev/test) | **PostgreSQL** | Free, enterprise-grade, closest free equivalent to Oracle |
| Frontend framework | **React + Vite** | Component-based UI, fast dev server |
| Authentication | **JWT (JSON Web Tokens)** | Stateless login — employee ID + password → token issued on login |
| Word generation | **docx (npm package)** | Node.js equivalent of python-docx. Handles headings, tables, TOC, styles, borders |
| Backend hosting | **Render** (free tier) | Node.js web service |
| Database hosting | **Supabase** (free tier) | Managed PostgreSQL with web dashboard |
| Frontend hosting | **Vercel** (free tier) | React app deploy |

### Future Production Migration (Company Infra)
When deploying to company infrastructure:
- PostgreSQL → **Oracle Database** (Prisma supports Oracle — change one config line, update schema types)
- Auth → Company **LDAP / SSO / Employee ID system** (swap the auth module only)
- Hosting → Company servers (no code change needed, just env config)

---

## Authentication Design

### How Login Works (for this app)
1. User enters **Employee ID + Password** on the login page
2. Backend checks credentials against the `users` table
3. If valid → server issues a **JWT token** (an encrypted string, valid for 8 hours)
4. Browser stores the token and sends it with every request automatically
5. If the token is missing or expired → user is redirected to login

### Roles
| Role | Can Do |
|------|--------|
| **ADMIN** | Everything an engineer can do + manage users, configure section/field defaults in Dev Mode |
| **ENGINEER** | Create projects, edit field values, toggle sections, generate documents |

### MVP Test Accounts (hardcoded for development)
| Employee ID | Password | Role |
|------------|----------|------|
| `ADMIN001` | `admin@123` | Admin |
| `ENG001` | `eng@123` | Engineer |

Real company employee ID/password integration (LDAP) is a separate phase done at company deployment time.

---

## Project Folder Structure

```
firewater-web/
│
├── backend/
│   ├── index.js                    ← Express server entry point (port 3001)
│   ├── .env                        ← DB connection string, JWT secret
│   ├── prisma/
│   │   ├── schema.prisma           ← All DB tables defined here (single source of truth)
│   │   └── seed.js                 ← Seed script: project types, sections, fields, test users
│   ├── routes/
│   │   ├── auth.js                 ← POST /api/auth/login, POST /api/auth/logout
│   │   ├── projects.js             ← CRUD for projects
│   │   ├── sections.js             ← Section tree, toggles, table rows
│   │   ├── fields.js               ← Field values, overrides
│   │   └── generate.js             ← POST /api/generate/:projectId → .docx download
│   ├── middleware/
│   │   └── requireAuth.js          ← JWT verification middleware
│   ├── lib/
│   │   ├── sectionTree.js          ← build_section_tree() + assign_numbers() ported from Python
│   │   ├── valueResolver.js        ← resolve_all_values() ported from Python
│   │   └── docGenerator.js         ← Word document generator using docx npm package
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx           ← Employee ID + password form
│   │   │   ├── Dashboard.jsx       ← Project list, create new project
│   │   │   ├── Editor.jsx          ← Main editor: outline panel + section editor + field panel
│   │   │   └── AdminPanel.jsx      ← User management, Dev Mode (Admin only)
│   │   ├── components/
│   │   │   ├── OutlinePanel.jsx    ← Left: live numbered document outline tree
│   │   │   ├── FieldEditor.jsx     ← Right: fixed/dropdown/manual field inputs per section
│   │   │   ├── SectionEditor.jsx   ← Centre: rich text / check table / check list editors
│   │   │   ├── RevisionManager.jsx ← Revision history table, create new revision
│   │   │   └── GenerateButton.jsx  ← Validation → confirm → trigger generation → download
│   │   ├── api/
│   │   │   └── client.js           ← All fetch() calls to backend, JWT header auto-attached
│   │   └── App.jsx                 ← Router: /login, /dashboard, /editor/:projectId, /admin
│   ├── vite.config.js
│   └── package.json
│
└── README.md
```

---

## Database Schema (Prisma — 18 tables)

All 16 tables from the desktop beta carry over. 2 new tables added for web (users, organisations).
Prisma schema uses PostgreSQL types.

### New Tables (Web Only)

```prisma
model User {
  id          Int      @id @default(autoincrement())
  employeeId  String   @unique          // e.g. "ENG001", "ADMIN001"
  name        String
  passwordHash String                   // bcrypt hash — never store plain text
  role        Role     @default(ENGINEER)
  createdAt   DateTime @default(now())
  projects    Project[]
}

enum Role {
  ADMIN
  ENGINEER
}
```

### Carried-Over Tables (PostgreSQL / Prisma versions)

```prisma
model ProjectType {
  id          Int       @id @default(autoincrement())
  code        String    @unique         // REFINERY | PETROCHEMICAL | LNG | PIPELINE | TANKFARM | UTILITY
  name        String
  description String?
  sortOrder   Int       @default(0)
  projects    Project[]
  fieldOverrides FieldOverride[]
}

model Section {
  id                    Int       @id @default(autoincrement())
  parentId              Int?
  parent                Section?  @relation("SectionChildren", fields: [parentId], references: [id])
  children              Section[] @relation("SectionChildren")
  orderIndex            Int       @default(0)
  numberHint            String?   // e.g. "4.2.2" — reference only, computed live
  titleTemplate         String
  contentTemplate       String?   // clause text with {{placeholders}}
  visibilityRule        VisibilityRule @default(ALWAYS)
  projectTypesWhitelist Json?     // array of project type codes
  isHeadingOnly         Boolean   @default(false)
  notes                 String?
  fields                Field[]
  sectionTables         SectionTable[]
  contentItems          SectionContentItem[]
  toggles               ProjectSectionToggle[]
}

enum VisibilityRule {
  ALWAYS
  PROJECT_TYPE
  USER_TOGGLE
}

model Field {
  id               Int       @id @default(autoincrement())
  sectionId        Int
  section          Section   @relation(fields: [sectionId], references: [id])
  fieldKey         String
  label            String
  valueType        ValueType
  fixedValue       String?
  dropdownOptions  Json?     // array of strings
  defaultValue     String?
  units            String?
  placeholderTag   String?
  mandatory        Boolean   @default(false)
  overrides        FieldOverride[]
  projectValues    ProjectFieldValue[]
}

enum ValueType {
  FIXED
  DROPDOWN
  MANUAL
  CALCULATED
  MULTI_SELECT
}

model FieldOverride {
  id              Int         @id @default(autoincrement())
  fieldId         Int
  field           Field       @relation(fields: [fieldId], references: [id])
  projectTypeCode String
  projectType     ProjectType @relation(fields: [projectTypeCode], references: [code])
  overrideValue   String
}

model Project {
  id             Int       @id @default(autoincrement())
  name           String
  projectTypeId  Int
  projectType    ProjectType @relation(fields: [projectTypeId], references: [id])
  documentNumber String?
  revision       String    @default("0")
  owner          String?
  consultant     String?
  jobNumber      String?
  facilityName   String?
  location       String?
  createdById    Int
  createdBy      User      @relation(fields: [createdById], references: [id])
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  fieldValues    ProjectFieldValue[]
  sectionToggles ProjectSectionToggle[]
  tableRows      ProjectTableRow[]
  seedRowSelections ProjectSeedRowSelection[]
  contentSelections ProjectContentSelection[]
  revisions      RevisionHistory[]
  clauseMarks    ClauseRevisionMark[]
  generationLogs GenerationLog[]
}

model ProjectFieldValue {
  id        Int     @id @default(autoincrement())
  projectId Int
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  fieldId   Int
  field     Field   @relation(fields: [fieldId], references: [id])
  value     String
  @@unique([projectId, fieldId])
}

model ProjectSectionToggle {
  id        Int     @id @default(autoincrement())
  projectId Int
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  sectionId Int
  section   Section @relation(fields: [sectionId], references: [id])
  isEnabled Boolean @default(true)
  @@unique([projectId, sectionId])
}

model SectionTable {
  id                   Int       @id @default(autoincrement())
  sectionId            Int
  section              Section   @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  tableKey             String
  label                String
  columns              Json      @default("[]") // [{key, label, width, type}]
  sortOrder            Int       @default(0)
  snoFormat            SnoFormat @default(numeric)
  canAddRows           Boolean   @default(true)
  canDeleteRows        Boolean   @default(true)
  canReorderRows       Boolean   @default(false)
  canSelectDeselect    Boolean   @default(true)
  hasTextBody          Boolean   @default(false)
  cellSupportsDropdown Boolean   @default(false)
  seedRows             SectionTableRow[]
  projectRows          ProjectTableRow[]
  @@unique([sectionId, tableKey])
}

enum SnoFormat {
  numeric
  alpha_lower
  alpha_upper
}

model SectionTableRow {
  id               Int          @id @default(autoincrement())
  tableId          Int
  table            SectionTable @relation(fields: [tableId], references: [id], onDelete: Cascade)
  rowData          Json         @default("{}")
  isSeed           Boolean      @default(true)
  isMandatory      Boolean      @default(false)
  isCheckedDefault Boolean      @default(true)
  sortOrder        Int          @default(0)
  selections       ProjectSeedRowSelection[]
}

model ProjectTableRow {
  id        Int          @id @default(autoincrement())
  projectId Int
  project   Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tableId   Int
  table     SectionTable @relation(fields: [tableId], references: [id], onDelete: Cascade)
  rowData   Json         @default("{}")
  sortOrder Int          @default(0)
}

model ProjectSeedRowSelection {
  id         Int             @id @default(autoincrement())
  projectId  Int
  project    Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  rowId      Int
  row        SectionTableRow @relation(fields: [rowId], references: [id], onDelete: Cascade)
  isSelected Boolean         @default(true)
  @@unique([projectId, rowId])
}

model SectionContentItem {
  id        Int         @id @default(autoincrement())
  sectionId Int
  section   Section     @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  sortOrder Int         @default(0)
  itemType  ContentItemType @default(FIXED)
  label     String
  bodyText  String?
  options   Json?
  defaultOn Boolean     @default(true)
  notes     String?
  selections ProjectContentSelection[]
}

enum ContentItemType {
  FIXED
  CHECKBOX
  DROPDOWN
  ADDABLE
}

model ProjectContentSelection {
  id            Int                @id @default(autoincrement())
  projectId     Int
  project       Project            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  itemId        Int
  item          SectionContentItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  isSelected    Boolean            @default(true)
  chosenOption  String?
  @@unique([projectId, itemId])
}

model RevisionHistory {
  id           Int      @id @default(autoincrement())
  projectId    Int
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  revisionCode String
  revisionDate String   // ISO date string e.g. "2024-05-10"
  purpose      String?
  preparedBy   String?
  checkedBy    String?
  approvedBy   String?
  createdAt    DateTime @default(now())
  @@unique([projectId, revisionCode])
}

model ClauseRevisionMark {
  id           Int        @id @default(autoincrement())
  projectId    Int
  project      Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  sectionId    Int?
  fieldId      Int?
  revisionCode String
  changeType   ChangeType
  changeNote   String?
  createdAt    DateTime   @default(now())
}

enum ChangeType {
  ADDED
  MODIFIED
  DELETED
}

model GenerationLog {
  id          Int      @id @default(autoincrement())
  projectId   Int
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  generatedAt DateTime @default(now())
  outputPath  String?
  revision    String?
  generatedBy String?
}
```

---

## Key Business Logic (port from Python to Node.js)

These three functions are the core engine. They exist in `backend/lib/` and are called by the routes and the document generator.

### 1. `sectionTree.js` — buildSectionTree() + assignNumbers()

```
buildSectionTree(projectTypeCode, enabledToggleIds)
  → filters all 44 sections by visibility rules
  → returns nested tree of active sections for this project

assignNumbers(tree, prefix = "")
  → walks active tree recursively
  → assigns numbers live ("1", "1.1", "4.2.3")
  → NO numbers stored in DB — always computed fresh
  → removing a section = automatic clean renumbering, no gaps
```

### 2. `valueResolver.js` — resolveAllValues()

```
resolveAllValues(projectId, projectTypeCode)
  → returns { placeholderKey: resolvedValue } for every field
  → precedence chain (left = highest priority):
     User input  →  Project-type override  →  Default value  →  Fixed value
```

### 3. `docGenerator.js` — generateDocument()

```
generateDocument(projectId)
  → calls buildSectionTree() + assignNumbers()
  → calls resolveAllValues()
  → walks tree, for each active section:
      - adds Word heading at correct level (H1 / H2 / H3)
      - fills {{placeholders}} with resolved values
      - renders text paragraphs, tables, lists per section type
  → adds running header (3-col table: Logo | Title | DocNo/Rev/Page)
  → adds running footer (Format No. | Copyright)
  → adds cover page with revision block table
  → returns .docx Buffer → sent as file download
```

---

## Section Content Types & Editor Components

Every section has a specific editor. These map to React components:

| Section | Editor Component | Description |
|---------|-----------------|-------------|
| 1, 2, 4.1, 4.10, 4.11, 4.12 | `RichTextEditor` | Free text with bullet/list toolbar |
| 3.1 | `CheckTable` | Checkable seeded rows, add/delete, numeric S.No |
| 3.2, 4.2.1 | `CheckTable` | Same + reorder, alphabetic S.No (a., b., ...) |
| 3.3, 5 | `CheckList` | Checkbox list items, add/delete/reorder, alphabetic |
| 4.2.2 | `CheckTable` | 3 cols (S.No, Description, Philosophy), numeric |
| 4.2.3 | `CheckTable` | + dropdown cells + OMIT row option |
| 4.3 → 4.8, 4.7, 4.8 | `TextPlusTable` | RichText above + CheckTable below |
| 4.5.6 | `TextPlusTablePlusList` | Text + Table + notes sub-list (i., ii., iii.) |
| 3, 4, 4.2 | Heading only | No editor — title rendered, nothing editable |
| 4.2.4, 4.2.5 | USER_TOGGLE | Shown as disabled in outline — engineer can enable |

**4 reusable editor components cover all 44 sections:**
- `RichTextEditor` — free text with formatting toolbar
- `CheckTable` — seeded table rows with checkbox, add/delete/reorder
- `CheckList` — seeded list items with checkbox, add/delete/reorder
- `TextPlusTable` — RichTextEditor + CheckTable stacked

---

## API Routes (Express)

```
POST   /api/auth/login                    → { token, user }
POST   /api/auth/logout                   → 200

GET    /api/projects                      → list all projects for current user
POST   /api/projects                      → create project
GET    /api/projects/:id                  → get single project
PUT    /api/projects/:id                  → update project metadata
DELETE /api/projects/:id                  → delete project

GET    /api/projects/:id/tree             → section tree with live numbers
GET    /api/projects/:id/values           → all resolved field values
PUT    /api/projects/:id/values           → save field values (batch)
PUT    /api/projects/:id/toggles          → save section toggle states

GET    /api/projects/:id/tablerows/:tableId       → seed + project rows for a table
POST   /api/projects/:id/tablerows/:tableId       → add engineer row
PUT    /api/projects/:id/tablerows/:rowId         → edit engineer row
DELETE /api/projects/:id/tablerows/:rowId         → delete engineer row
PUT    /api/projects/:id/seedrows/:rowId          → toggle seed row selected/deselected

GET    /api/projects/:id/revisions        → revision history
POST   /api/projects/:id/revisions        → create new revision

POST   /api/generate/:id                  → generate .docx → file download

GET    /api/admin/users                   → list users (ADMIN only)
POST   /api/admin/users                   → create user (ADMIN only)
```

---

## Document Generator Output Format

Exactly matches EIL/BPCL reference document B895-000-17-43-BD-1001.

### Running Header (every page)
3-column table — top and bottom outer borders only (no side box):
```
[ EIL Logo ] | DESIGN BASIS FOR ACTIVE FIRE PROTECTION SYSTEM / <Project Name> | <DocNo> / Rev <N> / Page X of Y
```

### Running Footer (every page)
Single line with top border:
```
Format No. EIL-1641-1924A Rev.2          Copyright EIL — All rights reserved
```

### Cover Page
- Document title
- Project name, facility name, owner, consultant
- Revision block table: `Rev No | Date | Purpose | Prepared | Checked | Approved`

### Body Formatting
- Body font: Times New Roman
- Table font: Arial
- Section headings: Word Heading 1 / 2 / 3 styles (so TOC auto-updates in Word)
- TOC field inserted at start of body

---

## Seeded Reference Data (must be re-seeded in PostgreSQL via `prisma/seed.js`)

| Data | Count |
|------|-------|
| Project types | 6 (REFINERY, PETROCHEMICAL, LNG, PIPELINE, TANKFARM, UTILITY) |
| Sections | 44 (full document tree per BPCL reference) |
| Fields | 95 (FIXED, DROPDOWN, MANUAL, CALCULATED, MULTI_SELECT) |
| Field overrides | 3 (LNG, PIPELINE, TANKFARM) |
| Test users | 2 (ADMIN001, ENG001) |

All seed data must be ported from the Python `seed.py` file into `prisma/seed.js` using Prisma's `createMany()` calls.

---

## Fixed Engineering Values (read-only in UI, FIXED type in DB)

| Parameter | Value | Unit |
|-----------|-------|------|
| Hydrant spacing — process perimeter | 30 | m |
| Hydrant spacing — utility perimeter | 45 | m |
| Hydrant min distance from equipment | 15 | m |
| Hydrant outlet height above GL | 1.2 | m |
| Hydrant standpost size | 6 | inch |
| Hydrant coupling size | 2.5 | inch |
| Min network size — utility area | 10 | inch |
| Min network size — process area | 14 | inch |
| Ring main height above FGL | 300–500 | mm |
| Hydro test pressure | 27.3 | kg/cm²(g) |
| Max velocity in network | 5 | m/sec |
| Min residual pressure at remote point | 7 | kg/sq.cm(g) |
| Transformer threshold | 2000 litres / 10 MVA | — |
| Radiography — % welded joints | 10 | % |
| Field joints in radiography sample | 50 | % |
| Gear-operated valve above | 12 | inch |
| Isolation valve extra — segment > | 300 | m |
| RO target pressure | 7 | kg/sq.cm(g) |
| MV spray pressure range | 1.4–3.5 | bar(g) |
| HV spray pressure range | 3.5–5.0 | bar(g) |
| HVLRM min count | 2 | — |
| HVLRM foam induction distance | 60 | m |
| HVLRM max distance from hazard | 45 | m |
| Elevated HVLRM for column > | 30 | m |
| Monitor min distance from hazard | 15 | m |
| DCP portable capacity | 9 | kg |
| DCP cabinet height from FGL | 750 | mm |
| DCP max travel distance | 15 | m |
| DCP coverage area | 250 | m² |
| CO₂ coverage area | 250 | m² |
| SCBA duration | 45 | min (35 work + 10 escape) |
| Booster pump HVLRM rating | 2000 | UG GPM |

---

## Editable Values (DROPDOWN / MANUAL type in DB)

| Field | Type | Default |
|-------|------|---------|
| Project short name | MANUAL | — |
| Facility name | MANUAL | — |
| Owner full name | MANUAL | — |
| Location | MANUAL | — |
| Plant type | DROPDOWN | Polypropylene (PP) |
| Plant capacity | MANUAL | — |
| Primary standard | DROPDOWN | OISD-116 |
| Secondary standard | DROPDOWN | PNGRB |
| Water source | DROPDOWN | ETP Treated Water |
| Clean agent standard | DROPDOWN | OISD/PNGRB/NFPA-2001 |
| Hydraulic software | DROPDOWN | PIPENET |
| Fire water supply source | DROPDOWN | Existing supply network |
| Pump house description | DROPDOWN | Existing pump house |
| Pump capacity | DROPDOWN | Existing |
| Mobile firefighting | DROPDOWN | Existing Mobile equipment |
| Fire station | DROPDOWN | Existing fire station |

Project-type overrides (auto-applied, no user action needed):
- LNG → primary_standard = "NFPA 11"
- PIPELINE → primary_standard = "OISD-RP-108"
- TANKFARM → hydrant_spacing_utility = "30" m

---

## Development Phases

| Phase | Deliverable | Status |
|-------|------------|--------|
| 0 | Repo scaffold, Express server, Prisma schema, Supabase DB connected, seed script, test users, all routes returning stubs, Vercel + Render deploy | ⬜ Start here |
| 1 | Auth: login page, JWT issue/verify, route protection, role gate | ⬜ |
| 2 | Project CRUD: dashboard, create/open/edit project, project type selector | ⬜ |
| 3 | Section tree API + outline panel UI (live numbered outline, section toggles) | ⬜ |
| 4 | Field editor: FIXED (read-only), DROPDOWN (select), MANUAL (text input), value save | ⬜ |
| 5 | Section content editors: RichText, CheckTable, CheckList, TextPlusTable | ⬜ |
| 6 | Document generator: port Python logic to Node.js docx, .docx download | ⬜ |
| 7 | Revision tracking: create revisions, clause marks, revision block in output doc | ⬜ |
| 8 | Admin panel: user management, Dev Mode (section/field config) | ⬜ |
| 9 | Polish: validation, error handling, loading states, deployment pipeline | ⬜ |

---

## Reference Document

**Source:** BPCL Kochi Refinery — Design Basis for Active Fire Protection System
**Document No:** B895-000-17-43-BD-1001, Rev 1
**Project:** PMC & EPCM Services for Polypropylene Project, Kochi Refinery
**Owner:** Bharat Petroleum Corporation Limited (BPCL)
**Consultant:** Engineers India Limited (EIL)

All section titles, clause text, engineering values, and table structures were extracted
from this document and seeded into the database.

---

## How to Resume in a New Chat

1. Paste this entire file into the new chat
2. Also upload these files from the desktop beta for reference:
   - `seed.py` — original seed data (sections, fields, values)
   - `schema.sql` — original SQLite schema
   - `requirements_extracted.json` — per-section editor specifications
3. State which phase you are starting or resuming
4. The assistant has full context to proceed immediately
