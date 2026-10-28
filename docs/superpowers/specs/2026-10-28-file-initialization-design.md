# Automatic file initialization

The user selected generation from the current conversation and character when no saved file state exists. A workflow should supply its own valid starting documents instead of requiring manually prepared JSON.

## Behavior

- Read File offers `Generate from story`, `Valid starting template`, and `Require a file`. Generation is the default when no file is configured. Existing configured destinations remain authoritative, including missing/revoked external bindings.
- Reuse compatible existing chat catalog/state before allocating a managed file. Preserve saved contents and report malformed or unauthorized existing state rather than replacing it.
- Automatically managed readers get valid initial contents from their declared schema, format, and columns. A reader may inherit a connected writer's schema when it has none. This does not invent established story facts.
- A missing managed file is populated once from bounded current conversation and character context. The prompt includes the document purpose, initialization instructions, schema and valid seed. Unknown facts remain unspecified.
- Generated contents use the reader's model selector, completion limit and normal bounded model execution. Existing files make no initialization request. Generation errors and invalid output hold the affected workflow path.
- Initialization is a run-local virtual document until accepted. A downstream write updates that document; when there is no downstream writer, acceptance persists the initialized document itself. Preview, rejection, cancellation and failed runs publish no story bytes.
- User/chat/character changes and concurrent file creation invalidate initialization. Reloading an accepted file reuses it without another model request. Private files retain their existing character scope.
- Settings and schema travel with workflow exports; machine authority and generated story contents do not become portable workflow configuration.

## Approaches

1. Valid templates only: cheap and deterministic, but does not populate the user's story state.
2. Reuse state, otherwise generate through normal model execution: selected by the user. Adds a bounded first-use request and produces useful starting state.
3. Hidden model calls during file preparation: rejected because calls would evade normal budgets, profiles and source authorization.

## Implementation decisions

Extend Read File with `initialization` (`generate`, `template`, `require-file`), `initializationInstructions`, and `initializationMaxTokens`. Keep unknown external file access separate from managed ownership. Share existing schema/template validation and model response validation. No new runtime dependencies or live provider requests are needed for verification.
