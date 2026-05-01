# Repository Guidance

## Moddable Piu Work

When working on files under `examples/piu/**` or `modules/piu/**`, or on an app that imports `piu/MC`, includes `manifest_piu.json`, or uses Piu objects such as `Application`, `Container`, `Content`, `Label`, `Style`, `Skin`, `Behavior`, `Port`, `Timeline`, or `Transition`, read and follow `skills/moddable-piu-builder/SKILL.md` before making changes.

Use the target app's existing Piu patterns and validate with the narrowest applicable Moddable command. If the project uses raw Moddable tooling, prefer running `mcconfig` from the target example or app directory and report the exact command used.
