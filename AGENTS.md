# Repository Guidance

## Moddable Piu Work

When working on files under `examples/piu/**` or `modules/piu/**`, or on an app that imports `piu/MC`, includes `manifest_piu.json`, or uses Piu objects such as `Application`, `Container`, `Content`, `Label`, `Style`, `Skin`, `Behavior`, `Port`, `Timeline`, or `Transition`, read and follow `skills/moddable-piu-builder/SKILL.md` before making changes.

Use the target app's existing Piu patterns and validate with the narrowest applicable Moddable command. For runnable examples or apps, prefer validating with Moddable's `test-examples` runner so the app is built, launched, and treated as passing only if it avoids runtime errors during the first few seconds after startup. For example:

```sh
node $MODDABLE/tools/test-examples/index.js sim/moddable_six --example examples/piu/carousel-slider
```

If `test-examples` is not applicable, use the narrowest suitable raw Moddable command. If the project uses raw Moddable tooling, prefer running `mcconfig` from the target example or app directory and report the exact command used.
