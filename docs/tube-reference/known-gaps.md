# Scope and fidelity

This is a warm, accessible adaptation of Matis Dene’s ImageTube, not an exact WebGL extraction. Public source is preserved at `evidence/FiberScene.tsx` from matdn/helmet main commit `74a99abf8fa1f12bb23ceb4522251093ba2a03a9`. The upstream README declares MIT.

CSS perspective replaces React Three Fiber / Three.js. The original helmet, black shader grid, audio, photographic assets, infinite repeated rows and vertical wheel translation are intentionally excluded. Scroll adds spin and continues scrolling the page. Final colors, proportions and speeds are deliberate design choices, not source constants. Browser automation cannot capture GPU frames or perform source-page ablation. These are documented fidelity limits, not unresolved implementation blockers.

The baseline is `capture-baseline/index.html`; serve the repository with `node server.mjs` and open `/docs/tube-reference/capture-baseline/index.html`. The final app is at `/`.
