# Code Smeller

**Code Smeller** is a lightweight Visual Studio Code extension that helps you write cleaner, more maintainable code by leveraging LLM-based analysis. It reviews your code for:

- Poor or vague variable naming
- Refactoring opportunities
- Coding standards violations

All feedback is rendered in a markdown-powered side panel, making it easy to read and act on.

---

## ✨ Features

- ✅ Right-click any code file to trigger a Gemini-powered code review
- ✅ Clear markdown feedback with naming, structure, and style suggestions
- ✅ Supports JavaScript, TypeScript, Python, and more
- ✅ Secure API key management using VSCode SecretStorage
- ✅ Extensible and language-agnostic by design

## 🔧 Extension Settings

This extension contributes the following VSCode settings:

- `codeSmeller.apiKey`: _(Optional)_ Store your Gemini API key (prefer SecretStorage instead)

---

## 📦 Commands

| Command                            | Description                                     |
| ---------------------------------- | ----------------------------------------------- |
| `Code Smeller: Smell Code`         | Analyze the open file with Gemini               |
| `Code Smeller: Set Gemini API Key` | Securely store your API key using SecretStorage |

---

## 🐞 Known Issues

- Markdown rendering may fail if network access to `marked.js` CDN is blocked
- Large files may be truncated by token limits of
