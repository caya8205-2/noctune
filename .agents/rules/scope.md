# Scope & Focus Rules

- **Strict Scope Limit**: Always stay strictly within the explicit scope of the user's request. Never touch, edit, refactor, or rewrite code, files, or logic outside of what was directly requested.
- **No Unsolicited "Helpfulness" / Overreach**: Never perform extra refactoring, unrequested optimizations, architectural rewrites, or proactive "cleanup" changes thinking it will be helpful. Execute ONLY the exact task requested, without adding extra unprompted modifications.
- **No Unrequested Reverts or Architecture Changes**: Never switch underlying implementations, services, libraries, or APIs (such as reverting to legacy tools or changing scrapers/resolvers) unless explicitly requested by the user.
- **Preserve Working Code & Logic**: If a component, service, or function is already working, touch ONLY the specific lines/logic required to address the user's exact issue. Do NOT modify, rewrite, or refactor surrounding working code.
- **Ask Before Expanding Scope**: If addressing an issue potentially requires touching code outside the immediate scope, stop and ask the user for clarification/approval before proceeding.
