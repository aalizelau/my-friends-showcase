# Tube adaptation QA

## Source → baseline
Passed with documented scope differences. The standalone baseline preserves the source radius, camera FOV, row staggering, row speed differences, spin acceleration and damping. Initial and scrolled captures show enlarged near planes, narrow side planes, receding far planes and independent moving rows. No browser console errors. Evidence: `evidence/source.png`, `evidence/baseline-initial.png`, `evidence/baseline-scroll.png`.

Baseline URL: `/docs/tube-reference/capture-baseline/index.html`. Viewport: 1280 × 720, DPR 2, Codex in-app browser. Animation is real-time rather than frame-locked. It is a source-informed CSS behavior rebuild, not pixel-identical WebGL replay.

## Intentional differences / truth audit
- SOURCE: cylindrical positions, source camera geometry, alternate half-column offsets, differential row speeds, time-based .92 inertia damping.
- GUESS / design choices: CSS compositing, local illustrated avatars, readable cards, final colors and dimensions.
- Original black shader grid, helmet, audio and photographic assets are outside the user's requested warm adaptation.
- Baseline does not reproduce infinite vertical wheel travel. Final uses finite unique, accessible friends; wheel adds spin without trapping page scroll.
- Read-only browser evaluation does not support ablation or GPU captures; source attribution uses the route's Canvas/ImageTube ownership and visible frames.

## Gate decisions
Target lock: passed (scout-card.json). Replay ready: passed (replay-manifest.json). Baseline: passed with intentional differences. Final integration: pending.


## Baseline → integrated app
Passed for the scoped design adaptation. `tube.js` retains cylindrical perspective, staggered rings, independent row speeds and damped spin. Intentional changes: 18 unique friends instead of repeated photographic tiles, rounded pastel paper cards, warm background, original avatars/branding, lower idle speed, finite rows, readable reverse sides and no technical grid/helmet. The independent baseline remains unchanged.

Browser checks:
- 1280 × 720 and 1280 × 900 desktop; 390 × 844, 320 × 740, and intermediate panel width. No horizontal document overflow. All filter buttons fit at 320px after the narrow-layout adjustment.
- All 18 local portrait images loaded; card and list modes each retain 18 records.
- Search with one result brings that portrait to the front and disables unneeded rotation controls. Empty relationship filter hides the tube and shows the existing empty state.
- Portrait click and Enter open the correct profile URL; Escape closes it and restores focus.
- New-friend dialog opens; Escape clears the modal and body scroll lock. No form was submitted and no friend data was changed.
- Pause leaves portrait transforms unchanged. Arrow controls rotate while paused. Drag changes transforms without opening a profile. Mouse fallback covers embedded browsers that emit only mouse events.
- Light/dark toggle remains functional and was restored to light. No browser console errors.

Automated checks (all passed):
- `node scripts/verify-tube.mjs`: reduced-motion default, explicit playback, manual rotation, one-loop scheduling, modal/hidden/offscreen suspension, view switching, touch-scroll separation, drag cancellation, one/zero-result behavior and finite mobile transforms.
- `node scripts/verify-roundtrip.mjs`: all existing Markdown files round-trip byte-for-byte; new-friend/source serialization cases unchanged.
- `node --check app.js`, `node --check tube.js`, `git diff --check`.

Evidence: `evidence/desktop.png`, `evidence/mobile.png`, `evidence/mobile-320.png`, preserved baseline frames and the executable lifecycle checks. Timing comparisons use real-time frames; no frame-perfect shader equivalence is claimed. Touch hardware was not available; touch lifecycle checks ran in the deterministic harness.

## Final gate decision
`DONE_PROJECTIZED` — source-informed behavior rebuild, with explicit user-requested visual differences. No open blocking issues. Base commit and `redesign-random-9-avatars` both resolve to `298658c4f9796e552c7153da309680f4486e75a7`; working branch is `redesign-friends-tube`.
