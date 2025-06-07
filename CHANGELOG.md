# Change Log

All notable changes to the "code-smeller" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Initial release

## [0.0.4]

### Changed

- Changed the linter from eslint and pylint to whatever is used by vscode

## [0.0.5] -2025-05-29

### Added

- **Cache system** for Gemini-powered reviews (per file, refreshed every 3 days)
- **Command:** `Code Smeller: Add Language` to dynamically add the current `languageId` to the list of supported languages
- **Config option:** `codeSmeller.addLanguage` now user-editable
- **Code Review panel persistence:** Sidebar panel stays open and updates between Smell Code runs

### Changed

- `Code Smeller: Smell Code` menu option to `Smell Code`

### Removed

- Legacy hardcoded language support list

### Security

- Continued use of VS Code SecretStorage to securely store the Gemini API key

## [0.0.6] -2025-06-07

### Changed

- Updated system prompt to provide more actionable recommendations

### Security

- Continued use of VS Code SecretStorage to securely store the Gemini API key
