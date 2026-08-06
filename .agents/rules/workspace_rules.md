# Workspace Rules

## 1. Scope & Focus

- **Strict Scope Limit**: Always stay strictly within the explicit scope of the user's request. Never touch, edit, refactor, or rewrite code, files, or logic outside of what was directly requested.
- **No Unsolicited "Helpfulness" / Overreach**: Never perform extra refactoring, unrequested optimizations, architectural rewrites, or proactive "cleanup" changes thinking it will be helpful. Execute ONLY the exact task requested, without adding extra unprompted modifications.
- **No Unrequested Reverts or Architecture Changes**: Never switch underlying implementations, services, libraries, or APIs (such as reverting to legacy tools or changing scrapers/resolvers) unless explicitly requested by the user.
- **Preserve Working Code & Logic**: If a component, service, or function is already working, touch ONLY the specific lines/logic required to address the user's exact issue. Do NOT modify, rewrite, or refactor surrounding working code.
- **Ask Before Expanding Scope**: If addressing an issue potentially requires touching code outside the immediate scope, stop and ask the user for clarification/approval before proceeding.

## 2. Safety & Revert Execution Rules

1. Do not run `git checkout`, `git restore`, `git reset`, rebase, or any command that restores or removes changes without explicit instructions from the USER.
2. Preserve the USER's uncommitted work. When asked to update documentation or a changelog, do not modify unrelated source code.

## 3. Changelog Writing Guidelines

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
