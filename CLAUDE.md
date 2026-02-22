# cc-statusline

Claude Code の statusline コマンド (単一ファイル Node.js CLI)。

## Architecture

- エントリポイント: `index.js` (243行、依存パッケージなし)
- stdin から JSON を読み取り、stdout に ANSI カラー付き 2行ステータスを出力
- 使用モジュール: child_process, fs, path, os, crypto (すべて Node.js 標準)

## Development

```bash
# ローカルテスト
echo '{"cwd":"/tmp","model":{"display_name":"Opus 4.6"},"context_window":{"used_percentage":30}}' | node index.js

# git リポジトリ内でテスト (ブランチ・PR情報が表示される)
echo "{\"cwd\":\"$(pwd)\",\"model\":{\"display_name\":\"Opus 4.6\"},\"context_window\":{\"used_percentage\":70}}" | node index.js
```

## stdin JSON Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | string | Yes | 作業ディレクトリ (git 情報の取得元) |
| `model.display_name` | string | No | モデル名 ("Opus"/"Sonnet"/"Haiku" でアイコン分岐) |
| `context_window.used_percentage` | number | No | コンテキスト使用率 (HP bar 表示に使用) |

## Key Implementation Details

- PR情報は `~/.claude/cache/pr-<repoHash>-<branch>.json` にキャッシュ (TTL: 5分、`STATUSLINE_PR_CACHE_TTL_MS` で上書き可)
- repoHash は `git rev-parse --show-toplevel` の MD5 先頭8文字
- HP bar は used_percentage を「85% (auto-compact閾値) までの残り」に変換
- OSC8 ハイパーリンクは BEL (\x07) ターミネータ使用
- 全 git コマンドに timeout: 3000ms、gh コマンドに `timeout 2` を設定

## Code Style

- CommonJS (`require`)、セミコロンあり
- 関数宣言 (`function`) 使用、アロー関数は変数代入時のみ

## Gotchas

- `gh` CLI 未インストール時は PR 情報が無視される (エラーにならない)
- stdin が不正 JSON の場合は `process.exit(0)` で無出力終了
- Nerd Font 未インストールのターミナルではアイコンが文字化けする
