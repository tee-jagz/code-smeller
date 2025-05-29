# 🧼 Code Smeller

**Code Smeller** is a fun, lightweight VS Code extension that helps developers write cleaner, more maintainable code using both **LLM-powered reviews** and **your editor's built-in linting system**.

It reviews your code for:

- Poor or vague variable naming
- Refactoring opportunities (DRY, SRP, etc.)
- Violations of language/framework best practices

All feedback is shown in a friendly markdown-powered side panel — complete with a "smell score" and quote from your favorite anime crew to set the tone. Think of it as your AI-powered code reviewer... with personality.

---

## ✨ Features

- ✅ **Live smell detection** using VS Code's own diagnostic engine. No extra linters required
- ✅ One-click code reviews powered by Gemini (optional)
- ✅ Smell Score (1–5) with themed quotes and custom Luffy images
- ✅ Real-time syntax smell score updates as you type
- ✅ Dynamic caching — reviews are cached per file, refreshed every 3 days or on VS Code close
- ✅ User-defined supported languages with Code Smeller: Add Language
- ✅ Supports any language with active VS Code diagnostics (JS, TS, Python, etc.)
- ✅ Secure API key management via VS Code SecretStorage
- ✅ Lightweight and non-intrusive design

---

## 🖥️ Live Preview

Here’s what Code Smeller looks like in action:

- **Left Panel**: Your active code file
- **Bottom Left**: Smell icon indicating overall score (hover for quote)
- **Right Panel**: Live, markdown-formatted suggestions with scoring and themed image

![Code Smeller in Action](resources/codesmellerscreenshot.png)

> 💡 **Tips**
>
> - You don’t need to manually run anything! Code Smeller updates in the side panel _as you write_, giving you instant insight without breaking your flow.
> - Linting quality depends on the language extension and settings you have installed. Ensure tools like ESLint or the Python extension are properly set up in your workspace.
> - For deeper insights, you can trigger a Gemini-powered review anytime via the Command Palette.

---

## ⚙️ Extension Settings

This extension contributes the following VS Code settings:

| Setting                          | Description                                                          |
| -------------------------------- | -------------------------------------------------------------------- |
| `codeSmeller.apiKey`             | _(Optional)_ Store your Gemini API key. Prefer using SecretStorage.  |
| `codeSmeller.supportedLanguages` | Array of supported languageIds. Updated dynamically via Add Language |

---

## 📦 Commands

| Command                                             | Description                                              |
| --------------------------------------------------- | -------------------------------------------------------- |
| `Code Smeller: Smell Code`                          | Run a Gemini-powered code review on the current file     |
| `Code Smeller: Set Gemini API Key`                  | Securely store your API key using VS Code SecretStorage  |
| `Code Smeller: Add Language To Supported Languages` | Adds the current file’s languageId to the supported list |

---

## 🖼️ Smell Score System

Code Smeller assigns a **smell score** from 1 (clean) to 5 (disaster), using custom illustrations to match each level of code hygiene. The images appear in the side panel alongside Luffy-style quotes to keep things fun and helpful.

| Score | Meaning           | Visual Expression                         | Quote                                                |
| ----- | ----------------- | ----------------------------------------- | ---------------------------------------------------- |
| 1     | ✨ Squeaky clean  | <img src="resources/img1.png" width="60"> | “Shishishi~! This code’s tighter than anchor rope!”  |
| 2     | 🧐 Slightly off   | <img src="resources/img2.png" width="60"> | “Oi... it’s decent, but somethin’s off in the wind.” |
| 3     | 😐 Needs cleanup  | <img src="resources/img3.png" width="60"> | “It’s not the worst, but it needs serious polish.”   |
| 4     | 🤢 Smelly         | <img src="resources/img4.png" width="60"> | “Too much goin’ on — clean it up or we’ll sink!”     |
| 5     | ☠️ Code is lethal | <img src="resources/img5.png" width="60"> | “THIS CODE’S A DISASTER! PATCH THE HOLES!!”          |

Each review starts with the appropriate image and quote, followed by a markdown-rendered breakdown of real, actionable feedback.

---

## 🐞 Known Issues

- Markdown rendering may fail if CDN access to `marked.js` is blocked
- Very large files may be truncated due to token limits in the LLM
- Live Syntax code smell only supports JavaScript, TypeScript, and Python for now

---

## 🔐 Security Note

Your Gemini API key is stored securely using [VS Code SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage). You can update or remove it anytime via the Command Palette.

---

## 🤝 Contributing

PRs welcome! To add support for a new language or smell detection style, open an issue or submit a PR with your proposed config and review prompt style.

---

## 📜 License

MIT © 2025 Tolulope Jegede
