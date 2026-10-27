# Workflow failure policy verification

Implemented on `codex/workflow-failure-policy` from committed base `8e091ad21e0a057a9c39911c743708c2f03b7242`, in the managed workflow-failure-policy worktree. Original checkout changes are separate.

## Delivered behavior

The global **When a node fails** select offers **Fall back to SillyTavern** (default), **Stop all generation**, and **Continue where possible**. The preference is captured once per run and remains outside workflow files.

Recovery retains completed node artifacts, continues independent branches and respects authored optional Compose/Join inputs. Required failed dependencies block their consumers. Three surviving guidance contributions out of five are verified through the actual native controller without replaying completed calls. Unrecoverable required output stops the Send.

Recovered runs retain review handles, show **Completed with failures**, retain bounded safe diagnostics, and keep existing accepted-effect checks. A blocked Memory Commit cannot invalidate an independent surviving review or write memory. Successful produced commits remain subject to exact-intent authorization and explicit acceptance.

Native stopping uses the owned interceptor and actual SillyTavern stop API. Callback, delayed-event, source-order and chat-replacement regressions are covered. The stop owner is captured without invoking source getters before safe-plan publication. A switched chat cannot inherit an old Send's global stop.

## Final verification

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

## Decisions retained

Recovery stops when no valid required generation/output path survives. A fallback at that point would require changing this policy.

The worktree uses committed main rather than copying unrelated uncommitted reasoning-control changes. Integrating those changes later may require conflict resolution.
