# Security Policy

## Scope

This project is a **tool registry and CLI** for cataloging AI/LLM tools. The security of registry data (`registry/tools.json`) and the sandbox execution environment (`core/sandbox.js`) are the primary concerns.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅ |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue. Instead, report via:

- **GitHub Security Advisory**: Use the "Report a vulnerability" link under the repo's Security tab
- **Email**: Open an issue requesting a private contact method

You can expect an acknowledgement within 48 hours and an update at least every 7 days.

## Security Practices

- No `eval()` or dynamic code execution anywhere in the project
- Sandbox execution (`core/sandbox.js`) uses Docker isolation for untrusted tool code
- API keys (e.g., `AGNES_API_KEY`) are read from environment variables only — never hardcoded or committed
- All GitHub Actions workflow pins are SHA-pinned (not branch references)
- Dependencies are minimal: 1 runtime + 1 dev dependency
