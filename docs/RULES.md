# Agent Execution & Documentation Rules

This document defines Noctune's execution safety rules and documentation standards.

---

## 1. Safety & Revert Execution Rules

1. Do not run `git checkout`, `git restore`, `git reset`, rebase, or any command that restores or removes changes without explicit instructions from the USER.
2. Preserve the USER's uncommitted work. When asked to update documentation or a changelog, do not modify unrelated source code.

---

## 2. Changelog Writing Guidelines

Use two documentation layers with different purposes:

1. **`CHANGELOG.md` as the complete technical archive**
   - Record all important changes, including implementation details, endpoints, sidecars, caches, platform limitations, and architectural decisions.
   - Do not remove details merely to make the wording simpler; the complete technical version remains available through the full changelog dropdown in the modal.
   - Group changes by feature or product area, with the primary release changes at the top.

2. **`ChangelogModal.tsx` as the readable release highlight**
   - Write from the user's perspective: explain what users can do and what benefit they experience.
   - Use clear titles and context-rich descriptions instead of buzzwords or internal jargon.
   - Explicitly distinguish between new features, fixes, renames, and improvements. Do not describe a behavior fix as a new feature.
   - If one feature involves several technical changes, combine them into one coherent showcase instead of creating overlapping bullets.
   - Avoid file names, component names, endpoints, and implementation terminology in the main highlights unless they help users understand the change.
   - For fixes, briefly explain the previous behavior or problem and the resulting behavior after the fix.
   - For renames or logic changes, explain why the change was made and what confusion or problem it removes.
   - Do not include internal development bugs that users never encountered as release highlights.
   - Do not present internal implementation work as a new user-facing feature.
   - When a trade-off or temporary solution exists, explain it honestly: its user impact, why the approach was chosen, and the intention to find a better solution.

3. **Versioning and release order**
   - New features usually belong in a minor release; pure bug fixes usually belong in a patch release. Follow the established version unless a version change is explicitly requested.
   - Put the main showcase first, followed by supporting changes and polish.
   - Avoid generic headings such as “Bug Fixes” or “Feature Polishing”; use categories that describe the relevant product area.

4. **Dependency and sidecar transparency**
   - Document binary and sidecar changes technically in `CHANGELOG.md`.
   - In the modal highlights, describe dependencies only to the extent that they affect users, including app size, speed, internet requirements, or platform limitations.
