---
name: moddable-piu-builder
description: Use when building, modifying, or reviewing Moddable SDK applications that use the Piu GUI framework, including Piu Application, Container, Content, Label, Style, Skin, Behavior, Port, Timeline, Transition, manifest resources, simulator validation, and embedded display constraints.
---

# Moddable Piu Builder

Use this skill for Moddable SDK GUI work that uses Piu. Favor small, memory-conscious JavaScript modules and project-local patterns over web-style UI assumptions.

## First Steps

1. Inspect the local project before coding:
   - `examples/piu/**`
   - `modules/piu/**`
   - `node_modules/@moddable/typings/piu/**` when API shape or constructor dictionaries are unclear
   - the target app's `manifest.json`
   - any project-local screen, behavior, asset, or driver modules
2. If local examples are insufficient, read `references/piu-sources.md` and open only the official sample or documentation link relevant to the task.
3. Confirm the target device or simulator. If the user does not specify one, default to simulator-oriented code and keep device-specific input, display size, and hardware hooks isolated.
4. Confirm the actual input model. Do not add hardware-button navigation, focus state, or selected-cell UI unless the target interaction needs it.

## Implementation Rules

- Start Piu apps with `import {} from "piu/MC";` unless the existing project uses a different Piu entrypoint.
- Build screens with Piu templates such as `Application.template`, `Container.template`, and project-local screen templates.
- Put interaction logic in `Behavior` classes. Use `onCreate`, `onDisplaying`, touch handlers, timers, and delegated methods instead of scattered global functions.
- Keep model data separate from visual templates when practical. Pass data into templates rather than hard-coding strings and dimensions deep in UI nodes.
- Use `application.defer(...)` or `delegate(...)` when switching screens or routing events from hardware callbacks.
- When replacing screens, remove children intentionally and consider `application.purge()` if resources should be released.
- Prefer responsive layout using Piu anchors and measured screen dimensions instead of fixed coordinates, unless the target display is fixed by the request.
- Keep hardware-specific controls behind feature checks such as `global.button` or `global.Host?.Button`.
- Declare assets and Piu dependencies in `manifest.json`; do not assume images, fonts, or modules are available without manifest entries.
- Be conservative with object counts, timers, large images, and retained data. Piu runs on constrained devices as well as desktop simulators.
- Do not convert JavaScript Piu apps to TypeScript unless the user asks. Use TypeScript declarations as reference material for API names, option dictionaries, and event signatures.
- For 320x240 layouts, budget vertical space explicitly for title/status text before sizing the main content. Do not place status labels flush to the bottom edge.
- Avoid interaction affordances that do not map to the active input method. For example, a selected-cell highlight is useful for button navigation, but confusing in a tap-only grid.

## Validation

Use the narrowest validation that matches the change:

- Static project check: `npm run check`
- Environment check: `npx xs-dev doctor`
- Simulator build/run: `npx xs-dev run --device mac <projectPath>`
- Device build/run: `npx xs-dev run --device <device> <projectPath>`

If the project uses raw Moddable tooling instead of `xs-dev`, run the equivalent `mcconfig` command from the target example directory and mention the exact command used.

## Common Pitfalls

- Forgetting `manifest_piu.json` or asset/module includes in `manifest.json`.
- Writing browser DOM or Canvas-style code instead of Piu object templates and Behaviors.
- Hard-coding `320x240` assumptions without checking `global.screen`.
- Filling a 320x240 screen with the main widget first and then adding labels, causing bottom text to clip.
- Updating the UI directly from hardware callbacks without delegating into the application behavior.
- Creating many timers or large retained objects when a single behavior-level timer or lightweight model is enough.
- Switching screens without removing old contents, causing retained resources and duplicate event handling.
- Using a Piu sample that depends on hardware features not present on the requested target, or adding hardware controls before the user asks for them.

## When Reviewing Code

Check manifest completeness, target compatibility, screen lifecycle, behavior/event routing, asset size assumptions, responsive layout, and whether simulator validation still works.
