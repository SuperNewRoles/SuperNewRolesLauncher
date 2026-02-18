# SuperNewRolesLauncher Release Notes Style Guide

Use this guide whenever you auto-author release notes for `supernewroles-release`.

## Goal
- Write user-facing release notes in Japanese and English.
- Keep the notes factual and based on actual changes.
- Use a fixed, publish-ready structure.

## Input Sources (required)
- Commit summaries in release range (`<previous-tag>..HEAD`)
- Changed user-facing behavior (features, fixes, UX changes)
- Release validation facts (artifact names, updater availability)

Do not invent features.

## Required Output Format (strict)
Output must follow this exact order:

```markdown
{Japanese release notes}
## SuperNewRolesLauncher_x64-setup.exe をダウンロード
{Japanese download notice}
---
{English release notes}
## Download SuperNewRolesLauncher_x64-setup.exe
{English download notice}
```

`{version}` is numeric (example: `0.1.1`).
`{tag}` is prefixed with `v` (example: `v0.1.1`).

## Writing Style

### Japanese section
- Tone: polite and direct (`です/ます`), no excessive honorifics.
- Start with a short summary sentence for user value.
- Use short bullets for concrete changes.
- Mention impact and who benefits.
- Keep each bullet to one clear point.

### English section
- Natural product-release tone, not literal machine translation.
- Keep meaning aligned with Japanese section.
- Use concise bullets and user impact wording.

## Section Template
Use this template for both languages:
- One summary line
- `### 主な変更` / `### Highlights`
- `### 修正` / `### Fixes` (if applicable)
- `### 注意事項` / `### Notes` (if applicable)

Do not add irrelevant sections.

## Download Notice Rules (required)
- direct asset URL: `https://github.com/SuperNewRoles/SuperNewRolesLauncher/releases/download/{tag}/SuperNewRolesLauncher_x64-setup.exe`

## Example (v0.1.1)
```markdown
このリリースでは、ランチャーの更新体験と安定性を改善しました。

### 主な変更
- アプリ更新の検出と通知の流れを改善し、更新有無を分かりやすくしました。
- 初回起動時の画面表示を調整し、主要操作に早く到達できるようにしました。

### 修正
- 更新チェック時に発生し得る一部の失敗ケースを修正しました。

## 導入方法
- 導入方法に関しては[READMEの導入方法セクション](/README.md#-導入方法)をご覧ください。
- ダウンロードはこちら: https://github.com/SuperNewRoles/SuperNewRolesLauncher/releases/download/v0.1.1/SuperNewRolesLauncher_x64-setup.exe
---
This release improves update flow and overall launcher stability.

### Highlights
- Improved update detection and messaging so users can understand update availability faster.
- Refined first-run screen behavior for quicker access to primary actions.

### Fixes
- Fixed a failure path that could occur during update checks.

## How to Install
- For installation instructions, please refer to the [Installation section of the README](/README.md#-installation).
- Download here: https://github.com/SuperNewRoles/SuperNewRolesLauncher/releases/download/v0.1.1/SuperNewRolesLauncher_x64-setup.exe
```
