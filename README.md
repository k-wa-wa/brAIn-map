# brAIn-map

AIと一緒に考えるマインドマップツール。ブラウザで直感的に付箋を操作しながら、ターミナルからAI(Claude等)がMCP経由でキャンバスを直接編集できる。

```
ターミナル（AI agent）  ←  MCP SSE  →  サーバー  →  SSE  →  ブラウザ（canvas）
```

---

## Quick Start

```bash
# リポジトリのルートで
npm install
npm run build -w packages/shared

# 新しいセッションを作成して起動
cd /your/project
npx brain-map new "product brainstorm"
```

起動すると以下が表示される：

```
  brAIn-map
  ────────────────────────────────────────────────────
  Canvas    http://localhost:3000
  MCP SSE   http://localhost:3000/mcp/sse
  File      ./product-brainstorm.brain-map
  ────────────────────────────────────────────────────

  Add to .claude/settings.json:

  {
    "mcpServers": {
      "brain-map": {
        "type": "sse",
        "url": "http://localhost:3000/mcp/sse"
      }
    }
  }
```

ブラウザが自動で開く。`.claude/settings.json` に表示された設定を追加すれば、Claudeがそのままキャンバスを操作できる。

---

## 推奨ワークフロー

```
  ┌─────────────────────┐    ┌─────────────────────┐
  │  ターミナル          │    │  ブラウザ            │
  │  (Claude Code等)    │    │  (tldraw canvas)    │
  │                     │    │                     │
  │  > "このアイデアを  │    │  付箋がリアルタイム  │
  │    クラスタリング   │    │  に追加・移動される  │
  │    して"            │    │                     │
  └─────────────────────┘    └─────────────────────┘
```

1. **発散** — ブラウザで付箋を自由に追加 / AIに「関連アイデアを10個追加して」と指示
2. **収束** — AIに「似たノードをグループ化して」と指示
3. **整理** — AIに「この構造をアウトラインにまとめて」と指示

---

## CLI

```bash
brain-map new <name>     # 新しいセッション作成 + 起動
brain-map open [file]    # 既存ファイルを開く
brain-map list           # カレントディレクトリの .brain-map ファイル一覧

# オプション
--port 3000              # ポート指定（デフォルト: 3000）
--no-open                # ブラウザ自動オープンをスキップ
```

セッションは `.brain-map` ファイルとして保存される（SQLite）。

---

## MCP Tools

ClaudeなどのAIがキャンバスを操作するためのツール一覧。

| ツール | 説明 |
|---|---|
| `get_canvas_state` | 現在のキャンバス全体を取得（ノード・エッジ・グループ） |
| `add_node` | 付箋/テキストノードを追加 |
| `update_node` | テキスト・色・位置・グループを更新 |
| `delete_node` | ノードと接続エッジを削除 |
| `connect_nodes` | 2つのノードを矢印で接続 |
| `delete_edge` | 接続を削除 |
| `group_nodes` | 複数ノードをグループにまとめる |
| `delete_group` | グループを削除（ノードごと削除も可） |

### 使用例（Claude Codeから）

```
# キャンバスの現状を把握してからアイデアを追加
"まずキャンバスを確認してから、ユーザー認証に関連するアイデアを5つ追加して"

# 自動クラスタリング
"似たようなテーマのノードをグループ化して、グループ名もつけて"

# 関係性の可視化
"原因と結果の関係があるノード同士を矢印で接続して"
```

---

## Architecture

```
packages/
├── shared/        Zodスキーマ（CanvasNode, Edge, Group, SseEvent, MCPツール型）
├── mcp-server/    Express + MCP Server（ポート3000）
│   ├── REST API   /api/*     GUIからの操作
│   ├── SSE        /sse/canvas   AIの操作をGUIへリアルタイム配信
│   └── MCP SSE    /mcp/sse   AI agentのエントリポイント
├── frontend/      React + tldraw（devサーバー: ポート5173）
└── cli/           brain-map コマンド
```

**設計のポイント：**
- GUIもAI（MCP）も同じDB関数を呼ぶ。操作の定義は1箇所のみ。
- AIがキャンバスを操作すると SSE でGUIに即反映される。
- セッションは `.brain-map` ファイル（SQLite）として保存。Git管理可能。

---

## Development

```bash
# 依存関係インストール
npm install

# Zodスキーマのビルド（初回・変更時）
npm run build -w packages/shared

# サーバー起動（MCPとREST API）
npm run dev:server

# フロントエンド起動（別ターミナル）
npm run dev:frontend

# 型チェック（全パッケージ）
npm run typecheck
```

フロントエンドの開発時は `http://localhost:5173` にアクセス（viteプロキシ経由でサーバーに繋がる）。

---

## Tech Stack

| 層 | 技術 |
|---|---|
| Frontend | React + [tldraw](https://tldraw.dev/) |
| Server | Node.js + Express |
| MCP | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) |
| DB | sql.js（WASM SQLite、ネイティブビルド不要） |
| Validation | Zod（shared パッケージで全層共有） |
| Language | TypeScript（全パッケージ統一） |
