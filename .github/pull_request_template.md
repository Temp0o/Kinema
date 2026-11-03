## What and why

<!-- What does this PR change, and why? Link the issue it resolves. -->

Closes #

## How to test

<!-- Steps a reviewer can follow to see the change working. -->

1.

## Screenshots / recording

<!-- For UI changes: before/after screenshots or a short recording (dark and light theme if relevant). Delete this section otherwise. -->

## Checklist

- [ ] `npm run typecheck`, `npm test` and `npm run build:web` pass
- [ ] New logic has unit tests; bug fixes include a regression test where practical
- [ ] Follows the [architecture rules](https://github.com/Temp0o/Kinema/blob/HEAD/CONTRIBUTING.md#architecture-rules): document changes go through `mutate()`, one undo step per user action
- [ ] Works in the Electron app (`npm run dev`) and in browser mode (`npm run dev:web`)
- [ ] User-facing changes are noted under `[Unreleased]` in `CHANGELOG.md`, and docs are updated if needed
- [ ] No new runtime network calls, telemetry or remote assets
