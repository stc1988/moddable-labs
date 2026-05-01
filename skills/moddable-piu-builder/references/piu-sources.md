# Piu Sources

Use this reference to choose what to read next. Load only the link or local file needed for the current task.

## Local Sources

- `examples/piu/screens/main.js`: local screen-switching Piu app with touch and hardware-button routing.
- `examples/piu/screens/manifest.json`: local Piu app manifest showing `manifest_base.json`, `manifest_piu.json`, module aliases, and resources.
- `examples/piu/wifiApConnectQRcode/main.js`: local Piu app that combines a service setup step with a screen template.
- `modules/piu/behaviors/behaviors.js`: local shared behavior pattern for screen metadata.
- `node_modules/@moddable/typings/piu/*.d.ts`: local installed Piu TypeScript declarations. Use these to confirm API shape while still writing JavaScript unless TypeScript is explicitly requested.

## Official Sources

- Piu documentation: https://github.com/Moddable-OpenSource/moddable/blob/public/documentation/piu/piu.md
- Piu examples: https://github.com/Moddable-OpenSource/moddable/tree/public/examples/piu
- Contributed examples: https://github.com/Moddable-OpenSource/moddable/tree/public/contributed
- Moddable SDK typings: https://github.com/Moddable-OpenSource/moddable/tree/public/typings
- Piu typings in npm package: `node_modules/@moddable/typings/piu/`

## Official Example Selection

- Images: `examples/piu/images`, `examples/piu/balls`, `examples/piu/neon-light`
- Text and labels: `examples/piu/text`, `examples/piu/cards`, `examples/piu/localization`
- Animation: `examples/piu/easing-equations`, `examples/piu/transitions`, `examples/piu/timeline`
- Touch input: `examples/piu/drag`, `examples/piu/keyboard`, `examples/piu/map-puzzle`
- Scrolling: `examples/piu/scroller`, `examples/piu/list`
- Networking UI: `examples/piu/wifi-config`, `examples/piu/weather`, `examples/piu/mini-weather`
- E-paper or low-refresh displays: `examples/piu/epaper-*`, `examples/piu/love-e-ink`

## Notes

- The official `examples/piu` README says most examples target QVGA but many use responsive layouts. Do not assume all examples run on the desktop simulator; check the example README or manifest before using one as a validation target.
- The Moddable SDK README describes Piu as an object-based UI framework built on Commodetto. When a task needs custom drawing, check whether a Piu `Port` or lower-level Commodetto/Poco API is the right tool.
- Type declarations are reference material, not an instruction to implement in TypeScript. Prefer JavaScript for Piu app code unless the request or existing project is TypeScript-based.
