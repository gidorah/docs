---
title: "ADR-017: Keep the Schema Revision-Friendly Without Implementing Full Revisions Yet"
description: "Full revisioning is not required yet, but future frozen revisions should be an additive feature rather than a schema rewrite."
status: Accepted
date: 2026-03-18
implementation: shipped
implemented-in: supabase/migrations/20260408000001_canonical_enums_and_document_structures.sql
---


## ADR-017: Keep the Schema Revision-Friendly Without Implementing Full Revisions Yet

### Context

Full revisioning is not required yet, but future frozen revisions should be an additive feature rather than a schema rewrite.

### Decision

Shape the schema so future revisioning can be added without remodeling core tables, but keep edits on the same active `document_structure` in MVP.

### Consequences

_Not stated in original TD-017._

### Implementation notes

The `document_structures` abstraction (`20260408000001`) is the seam revisions would plug into: both `canonical_categories` and `canonical_items` carry a NOT NULL `document_structure_id` foreign key (`20260408000002` lines 30, 88), so the live editable tree is already scoped to a structure rather than directly to a document.
