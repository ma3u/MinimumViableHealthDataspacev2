# Project Guidelines

This repository contains planning documents and schema definitions for the Minimum Viable Health Dataspace v2 project. There is no compiled code, services, or automated build system; most work is in Markdown.

## Code Style

- Primary artifacts are Markdown (`.md`) files. Follow common Markdown conventions:
  - Use `#`, `##`, etc. for headings.
  - Use fenced code blocks (`` ` ``) for snippets.
  - Keep lines wrapped at ~80 characters when possible.
  - Tables and lists should be formatted cleanly.
- If any scripts or source files are added later, follow the appropriate language idioms and formatting tools (prettier/black) where applicable.

## Architecture

- There is no application architecture; the repo is a collection of planning and schema documents:
  - `planning-health-dataspace-v2.md` describes goals and steps.
  - `health-dataspace-graph-schema.md` defines the data graph schema.
- Agents should treat each file as a self‑contained specification.

## Build and Test

- There are no build or test commands for this workspace.
- If future code is introduced, default to standard tools (e.g. `npm install && npm test` for JS, `python -m pytest` for Python) and update these instructions accordingly.

## Project Conventions

- When editing existing Markdown, maintain the existing tone and formatting.
- Use relative links when referring to other documents in the repo.
- Add new files under the root or appropriate subfolders.

## Integration Points

- There are no external dependencies or services currently.
- Any future integrations (APIs, databases, etc.) should be documented clearly in the planning files.

## Security

- No sensitive data should be committed; the repository contains only design documents.

---

> _Note for AI agents_: your role is to help draft and refine project documentation, suggest schema improvements, and assist with planning. There is no executable code to run currently. Feel free to prompt the user for clarification when specifications are vague.
