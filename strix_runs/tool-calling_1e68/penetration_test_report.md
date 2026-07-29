# Security Penetration Test Report

**Generated:** 2026-07-26 05:57:45 UTC

# Executive Summary

# Executive Summary

An external security assessment of the **Tool-Calling** CLI tool registry and invocation system identified multiple weaknesses that could lead to unauthorized command execution and CI/CD supply-chain compromise.

**Overall risk posture: Elevated.**

**Key findings:**

- **Command Injection in Docker Sandbox (Critical)** — The `invokeInSandbox` and `invokeInSandboxCapture` functions in `core/sandbox.js` pass unsanitized CLI/MCP arguments directly to `sh -c`, enabling arbitrary command execution inside the container. This affects both the CLI `invoke` command and the MCP `run_tool` endpoint.

- **Regex Injection in Tool Scanner (Medium)** — The `scan-tool.js` script constructs regular expressions using unescaped user-controlled GitHub repository names, allowing regex injection and potential ReDoS attacks during tool scanning operations.

- **Mutable GitHub Actions References (Low)** — Workflow files use mutable tag references (`@v4`, `@v3`) instead of pinned commit SHAs, exposing the CI/CD pipeline to supply-chain attacks via compromised action repositories.

**Business impact:**

- An attacker with access to the CLI or MCP interface can execute arbitrary commands within the Docker sandbox, potentially reading or modifying tool source code mounted into the container.
- Malicious repository names could alter the tool scanner's behavior or cause denial of service during scanning.
- Compromised GitHub Actions could inject malicious code into the CI/CD pipeline with repository write permissions.

# Methodology

# Methodology

Conducted per the **OWASP WSTG** and **PTES** frameworks.

**Engagement type:** White-box source code analysis with static vulnerability scanning.

**Scope:** `/workspace/Tool-Calling` — Node.js CLI tool registry system including core modules, scripts, web frontend, and GitHub Actions workflows.

**Activities:**
1. **Codebase mapping** — Full structural analysis of all JavaScript/TypeScript source files, configuration, and deployment artifacts.
2. **Static analysis** — Ran semgrep (1077 rules), gitleaks (1 secret found), trivy fs (dependency scan), and AST structural mapping across the repository.
3. **Manual code review** — Deep analysis of security-critical paths: Docker sandbox execution, URL validation, shell command construction, HTTP request handling, and web frontend rendering.
4. **Payload validation** — Built proof-of-concept scripts to verify command injection feasibility and regex injection behavior.
5. **Infrastructure review** — Examined GitHub Actions workflow files for supply-chain risks and external dependency integrity.

# Technical Analysis

# Technical Analysis

**Severity model** reflects exploitability multiplied by business impact.

## Confirmed Vulnerabilities

### 1. Command Injection in Docker Sandbox (Critical)

**Location:** `core/sandbox.js` lines 93–111, `buildDockerArgs()` function

The `buildDockerArgs` function constructs a shell command by concatenating setup commands with user-supplied arguments:

```javascript
const setupCmd = getSetupCommand(targetDir, tool);
const userCmd = args.join(' ');
const finalCmd = `${setupCmd}${userCmd || 'echo "No command provided"'}`;
```

This string is passed to Docker as `'sh', '-c', finalCmd`. Since `spawnSync` passes `finalCmd` as a single string argument to `sh -c`, any shell metacharacters (`;`, `|`, `$()`, backticks, `&&`) are interpreted by the shell, enabling arbitrary command execution.

Two attack vectors exist:
- **CLI path:** `node cli.js invoke <tool-id> "; malicious_cmd"`
- **MCP path:** `run_tool` method with crafted `args` array from JSON-RPC

The `getSetupCommand` function also concatenates `tool.install.command` from `tools.json` without sanitization, creating a secondary injection vector if the registry file is tampered with.

**CWE:** CWE-78 (OS Command Injection) | **CVSS:** 6.5 (Medium)

### 2. Regex Injection in Tool Scanner (Medium)

**Location:** `scripts/scan-tool.js` line 204

```javascript
description = description.replace(new RegExp(`Contribute to ${owner}/${repo}.*?GitHub\\.?`, 'i'), '').trim();
```

The `owner` and `repo` values are extracted from user-provided URLs and interpolated directly into a `RegExp` constructor without escaping regex metacharacters. While the URL validation limits these to non-slash characters, GitHub allows most other characters in repository names (including `.`, `*`, `+`, `?`, etc.).

**CWE:** CWE-185 (Regular Expression Error) | **CVSS:** 3.7 (Low)

### 3. Mutable GitHub Actions References (Low)

**Location:** `.github/workflows/deploy-pages.yml`, `sync-stars.yml`, `trending-weekly.yml`

Nine action references use mutable tags (`@v4`, `@v3`) instead of pinned commit SHAs:
- `actions/checkout@v4`
- `actions/setup-node@v4`
- `actions/configure-pages@v4`
- `actions/upload-pages-artifact@v3`
- `actions/deploy-pages@v4`

**CWE:** CWE-829 (Addition of Trust to Untrusted Controlled Interface)

## Additional Observations

- **Missing SRI:** External scripts (Chart.js from cdn.jsdelivr.net, Google Fonts) lack Subresource Integrity attributes.
- **Limited XSS surface:** Web frontend uses `textContent` for most rendering; `innerHTML` usage is confined to category names and leaderboard data from controlled JSON sources.
- **API key placeholder:** A dummy key (`sk-1234567890abcdef`) found in documentation HTML, likely not a real credential.
- **Strong URL validation:** The installer's `SAFE_REPO_URL` regex and `assertSafeRef` functions correctly prevent URL bypass, path traversal, and parameter injection for git operations.

# Recommendations

# Recommendations

## Immediate

1. **Sanitize shell command inputs in sandbox.js** — Escape shell metacharacters in user arguments before concatenation, or better yet, replace `sh -c` with Docker exec form using array-style arguments that bypass shell interpretation entirely. Validate `tool.install.command` against an allowlist of safe patterns.

2. **Escape regex metacharacters in scan-tool.js** — Use a helper function to escape special characters (`.[\*^${}()|\\]`) in owner/repo values before interpolating them into the RegExp constructor.

## Short-term

3. **Pin GitHub Action references to commit SHAs** — Replace all `@v4` and `@v3` references with full 40-character commit SHAs to prevent supply-chain manipulation.

4. **Add Subresource Integrity (SRI) attributes** — Include `integrity` and `crossorigin` attributes on all externally hosted scripts and stylesheets (Chart.js, Google Fonts).

5. **Review innerHTML usage in web/app.js** — Replace remaining `innerHTML` assignments with `textContent` or properly sanitized DOM methods for any data sourced from JSON files.

## Medium-term

6. **Implement input validation framework** — Create a centralized input sanitization module for all user-facing entry points (CLI args, MCP parameters, registry data).

7. **Add Content-Security-Policy headers** — Implement CSP headers on the web frontend to mitigate potential XSS through restricted script execution contexts.

## Retest & Validation

After remediation, re-test the following attack paths:
- CLI invoke with shell metacharacters (`;`, `|`, `$()`, backticks, `&&`)
- MCP run_tool with crafted argument arrays
- GitHub repository names containing regex metacharacters
- External script loading with compromised CDN responses

