# Workflow failure policy verification

Implemented on `codex/workflow-failure-policy` from committed base `8e091ad21e0a057a9c39911c743708c2f03b7242`, in the managed workflow-failure-policy worktree. Original checkout changes are separate.

## Delivered behavior

The global **Lattice → Workflow → When a node fails** checked submenu offers **Fall back to SillyTavern** (default), **Stop all generation**, and **Continue where possible**. The preference is captured once per run and remains outside workflow files. The deprecated SillyTavern Extensions drawer does not expose this setting.

Recovery retains completed node artifacts, continues independent branches and respects authored optional Compose/Join inputs. Required failed dependencies block their consumers. Three surviving guidance contributions out of five are verified through the actual native controller without replaying completed calls. Unrecoverable required output stops the Send.

Recovered runs retain review handles, show **Completed with failures**, retain bounded safe diagnostics, and keep existing accepted-effect checks. A blocked Memory Commit cannot invalidate an independent surviving review or write memory. Successful produced commits remain subject to exact-intent authorization and explicit acceptance.

Native stopping uses the owned interceptor and actual SillyTavern stop API. Callback, delayed-event, source-order and chat-replacement regressions are covered. The stop owner is captured without invoking source getters before safe-plan publication. A switched chat cannot inherit an old Send's global stop.

## Initial implementation verification

These complete checks were recorded before the UI location correction. The correction uses focused checks below.

- `npm test`: **408/408 test files passed**, exit 0, on the final reviewed source.
- `npm run test:browser`: **524 passed**, exit 0, against the rebuilt UI. Includes desktop/mobile global-setting acceptance.
- `npm run check:types`: **0 errors, 0 warnings**.
- `npm run build`: passed; generated UI JavaScript and CSS retained.
- `npm run check:assets`: passed; **842** versioned imports validated.
- `node tools/build-memory-examples.mjs --check`: passed; no generated example differences.
- `node tools/check-documentation.mjs`: passed; **506** local links checked.
- Final review fix wave: **145/145** affected tests passed; scoped re-review approved both findings.
- `git diff --check`: passed.

The initial complete-check invocation found an outdated dynamic test fixture missing the new policy dependency. That fixture was corrected, its seven tests passed, and the subsequent full 408-file unit sweep passed. An earlier sweep also caught source identity capture before safe-plan publication; the final getter-free stop ownership design preserves the existing ordering invariant.

All generation tests used synthetic transports and disposable fixtures, with no live provider requests.

## UI location correction verification

- The setting is directly under **Workflow → When a node fails** inside Lattice, with three exclusive choices and the saved choice marked. It is available during a run and from read-only views; changes still affect the next run.
- Removed the failure setting markup, save handler, repaint logic and CSS from the deprecated Extensions drawer.
- Replaced the drawer selection tests with an absence check that retains the existing launcher controls. Observed the expected failing assertion against the old drawer select, then **9/9** passing launcher tests with `node --test --test-isolation=none tests/lattice-launcher.test.mjs`.
- The original isolated test invocation encountered a Windows sandbox `spawn EPERM`; the in-process test invocation above passed without escalation.
- The five affected settings, launcher and menu unit test files passed using the repository's isolated runner.
- Seven focused browser tests passed: desktop/mobile menu selection, global persistence across workflow changes, keyboard navigation, live checked-state refresh while the submenu remains open, and existing Workspace menu behavior.
- Rebuilt UI; type checks reported zero errors/warnings; asset and documentation validation passed.
- Scoped review found one stale open-submenu selection marker; the regression was reproduced, fixed, and the scoped re-review approved the correction.

## Decisions retained

Recovery stops when no valid required generation/output path survives. A fallback at that point would require changing this policy.

The worktree uses committed main rather than copying unrelated uncommitted reasoning-control changes. Integrating those changes later may require conflict resolution.
