**Reviewer:** openai-codex/gpt-5.5 via pi

### Strengths
- Cost/subscription rendering was removed from the actual render path, width inputs, visibility flags, and tests; row 2 no longer collects or reserves space for cost data (`agent/extensions/footer.ts:550-641`, `agent/extensions/footer.ts:704-713`).
- Context denominator formatting is centralized and correctly changed to `%/window` with only the slash in the symbols color (`agent/extensions/footer.ts:371-385`).
- Row-2 separators now use literal spaces for both the model/thinking cluster and right-side metrics, while retaining the existing row-1 project separator as scoped by the spec (`agent/extensions/footer.ts:519-521`, `agent/extensions/footer.ts:387-400`).
- Nord provider coloring is implemented through the existing theme override mechanism and falls back to the dim token for other themes (`agent/extensions/footer.ts:191-208`, `agent/extensions/footer.ts:530-536`).
- Width-degradation behavior remains in a pure helper with updated coverage for token dropping, provider dropping, denominator dropping, and extremely narrow fallback (`agent/extensions/footer.ts:103-164`, `agent/extensions/footer.test.ts:78-187`, `agent/extensions/footer.test.ts:232-276`).
- Verification passed: `cd agent && npm test && npm run build` completed successfully with 118 passing tests, ESLint clean, and TypeScript `--noEmit` clean.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)
None.

### Recommendations
- Consider adding one render-level footer test in a future change to assert the composed wide row 2 contains no ` · `, `$`, or `(sub)` and uses `NN.N%/WINDOW`; the current helper tests are strong, but a smoke test of the render closure would guard integration wiring.

### Assessment

**Ready to merge: Yes**

**Reasoning:** The implementation meets the requested formatting and Nord color requirements, keeps degradation logic intact, and passes the project test/build verification. No production-blocking issues were found.
