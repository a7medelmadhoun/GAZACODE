# Changelog

All notable changes to GAZACODE are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-06-07

### Added
- **OpenCode Zen provider** with 40+ curated models (Claude Opus 4.8, GPT-5.5, Gemini 3.5, Kimi, GLM, Qwen, free models)
- **Task planning system** — AI outputs a `## Plan` with numbered steps; the box shows ⬜/✅ checklist that updates in real time
- **Settings page** — dedicated `/settings` command opens a full-screen page for provider, model, API key, and work folder
- **Improved system prompt** — strict rules force the AI to plan first, output one `✅` per step, hide all code from the chat
- **Code cleaning pipeline** — strips `FILE:` blocks, raw code fences, code keywords, and HTML tags from the visible response
- **Arabic / RTL support** — `bidiWrap()` uses Unicode RLE/PDF controls for proper RTL display in input and output
- **Green theme** — borders, prompt, folder, and thinking indicator all use a green palette
- **Persisted session** — provider, model, API key, and work folder changes are saved immediately
- **Larger model catalog** for OpenAI (gpt-5.5, o3, o4-mini), Anthropic (claude-opus-4-8, claude-sonnet-4-6), Gemini (gemini-2.5-pro)

### Changed
- Box UI is now centered in the terminal with a logo, subtitle, and box header
- "GAZACODE" branding moved out of the box header to a centered line above
- Refactored input refresh to not depend on `\u001b[s`/`\u001b[u` (better Windows compatibility)
- Improved `refreshInputLine()` to overwrite just the content line in place

### Fixed
- Provider changes are now persisted to `~/.opengaza/session.json` immediately
- "Thinking..." indicator no longer duplicates inside and outside the box
- Cursor column calculation in `refreshInputLine` accounts for `boxPad()` length
- ANSI escape codes are stripped when computing visible width for centering

## [1.0.0] - 2024

### Added
- Initial release with OpenAI, Gemini, Anthropic, OpenRouter support
- Chat interface with file operations and skills
- Browser control via Playwright MCP
- Auto-saved sessions
- Inquirer-based provider/model selection
