# Foundation passage examples

This release includes exactly two new singleton workflows, stable lessons **34** and **35**, alongside the original thirty lessons. See [the lesson guide](../../docs/examples.md#foundation-passage-lessons) for setup, costs and expected results.

Each lesson has a portable `.lattice.json` file and an editable `.lattice-document.json` file. Both retain descriptive lesson identity and checkpoint addresses. The catalog opens independent copies; Save As, Open and portable export retain supported settings.

- **34 — Split a lore chapter into useful passages:** an embedded file snapshot, Chunk, rendered passage text and native Guidance. UTF-16 preparation requires no tokenizer or model.
- **35 — Group replies into three-turn passages:** verified native sources, an explicit protected recent window, Chunk and native Guidance. Setup must be performed explicitly for the current chat.

The three synthetic files in `fixtures/` are also embedded in the installed catalog and available through **Practice files** downloads. They carry no native source authority. Use a disposable practice chat for JSONL imports.

Exact token sizing requires an explicitly matching tokenizer. The normal host may lack that capability; Details reports it and UTF-16 remains available. Token mode never falls back to a character estimate.

The generated manifest owns only the selected artifacts. Run `npm run examples:memory` to regenerate or `npm run check:examples-memory` to verify exact bytes. Generation refuses modified owned artifacts and unexpected prior ownership; unrelated user exports are left intact.

Other new memory lessons, background jobs, new indexing/retrieval and history replacement remain outside this release. Existing shipped Recall/search behavior is retained.
