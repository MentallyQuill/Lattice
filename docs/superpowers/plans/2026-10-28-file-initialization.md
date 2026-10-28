# Automatic File Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Track steps with checkboxes.

**Goal:** Unbound readers initialize valid documents from existing state or the current conversation and character.

**Architecture:** Extend the existing managed-file lifecycle and Read File descriptor. Admit initialization requests through the workflow engine and keep generated contents virtual until the normal acceptance boundary.

**Tech Stack:** Existing JavaScript modules, TypeScript declarations, Svelte, node:test and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-file-initialization-design.md`

## Global Constraints

- No new dependencies, live provider calls, or changes to the user's live chat/settings.
- Preserve configured file authority, existing data, visibility, checked writes and acceptance semantics.
- Generation is bounded and uses normal model selection, diagnostics and cancellation.

## Review Focus

- Existing empty or malformed files must not be mistaken for absent files.
- Chat/character/file changes during generation must prevent stale publication.
- A connected writer must compose with initialization without duplicate target effects.
- Rejecting a result must leave no generated story bytes on disk.
- Existing readers must avoid model binding when saved state is sufficient.

## Task 1: Contracts and managed reader preparation

**Files:** `src/workflow/file-initialization.js`, `.d.ts`, `operations/file-nodes.js`, `catalog.js`, `file-application-policy.js`, `managed-file-policy.js`, and scoped tests.

- [x] Add one failing contract/seed test and verify failure.
- [x] Add registered initialization controls, bounded descriptor calls and pure managed-reader preparation.
- [x] Validate schema-derived contents, state reuse and explicit destination preservation.
- [x] Test invalid schema/output, old state, formats and portable controls.

## Task 2: Engine and host lifecycle

**Files:** `src/workflow/runtime.js`, `host.js`, relevant declarations and host integration tests.

- [x] Add a failing first-use generation and accepted persistence scenario.
- [x] Prepare exact context inputs before engine authorization, lazily bind only missing generated readers, and route calls through the admitted request function.
- [x] Keep generated contents in a run-local overlay; expose them to readers and connected writers at the captured original file revision.
- [x] At settlement stage initialization only for targets without a later staged writer.
- [x] Prove second-run reuse, reject/cancel/no-write, invalid responses, concurrent creation and stale source handling.

## Task 3: UI and documentation

**Files:** `ui/NodeFile.svelte`, `ui/node-file-types.ts`, `src/ui/node-file-projection.js`, settings actions, node help and guides, scoped UI/browser tests.

- [x] Add a failing panel/readiness test for initialization controls.
- [x] Show initialization choice, instructions and completion limit; preserve existing settings when editing.
- [x] Explain first-use requests and acceptance in node help and file storage documentation.
- [x] Verify default and explicit-file journeys, including cancellation and stale drafts.

## Task 4: Integration and review

- [x] Run relevant node tests, type checks, build/assets checks and file browser tests.
- [x] Review the complete diff independently and resolve material findings.
- [x] Record validation results and deliver the reviewable worktree change.
