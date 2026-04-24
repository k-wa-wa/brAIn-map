# brAIn-map

AIと一緒に考えるマインドマップツール。ブラウザで直感的に付箋を操作しながら、ターミナルからAI（Claude等）がMCP経由でキャンバスをリアルタイムに編集できる。

```
ターミナル（AI agent）  ←  MCP SSE  →  サーバー  →  SSE  →  ブラウザ（canvas）
```

---

## Quick Start

```bash
npm install
npm run build

# プロジェクトディレクトリで
cd /your/project
npx brain-map product-brainstorm
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

ブラウザが自動で開く。`.claude/settings.json` に表示された設定を追加すれば、Claude がそのままキャンバスを操作できる。

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
2. **収束** — AIに「似たノードをグループ化して、cluster配置して」と指示
3. **整理** — AIに「この構造をアウトラインにまとめて」と指示

---

## CLI

```bash
npx brain-map <file>     # 指定したファイルを開く（存在しない場合は新規作成）

# オプション
--port 3000              # ポート指定（デフォルト: 3000）
--no-open                # ブラウザ自動オープンをスキップ
```

セッションは `.brain-map` ファイルとして保存される（SQLite）。Git 管理可能。

---

## MCP Tools

Claude などの AI がキャンバスを操作するためのツール一覧。

### 状態取得・探索

| ツール | 説明 |
|---|---|
| `get_canvas_summary` | ノード数・エッジ数・グループ数のサマリー。**最初に必ず呼ぶ** |
| `get_canvas_state` | 全ノード・エッジ・グループを一括取得。⚠️ ノードが多い場合は使わない |
| `get_graph_stats` | 孤立ノード数・接続数上位ノードなどグラフ統計。構造を把握するのに便利 |
| `list_nodes` | ノードをページネーション付きで取得（`groupId` フィルタ対応） |
| `list_edges` | エッジをページネーション付きで取得 |
| `list_groups` | グループ一覧を取得。ノードをグループに割り当てる前に必ず呼ぶ |
| `get_node` | 指定 ID のノードを1件取得 |
| `search_nodes` | テキスト内容で検索（大文字小文字無視）。重複確認・概念発見に使う |
| `get_neighbors` | 指定ノードに直接接続しているノードとエッジを取得 |

### ノード操作

| ツール | 説明 |
|---|---|
| `add_node` | 付箋ノードを1件追加。`position: {x, y}` で座標指定可 |
| `bulk_add_nodes` | 最大50件を一括追加。位置省略時はグリッド自動配置（後で `layout_canvas` 推奨） |
| `update_node` | テキスト・色・位置・グループを更新 |
| `delete_node` | ノードと接続エッジを削除 |

### エッジ操作

| ツール | 説明 |
|---|---|
| `connect_nodes` | 2ノード間に矢印を1本作成 |
| `bulk_connect_nodes` | 最大100本のエッジを一括作成。`bulk_add_nodes` とセットで使う |
| `delete_edge` | エッジを削除 |

### グループ操作

| ツール | 説明 |
|---|---|
| `group_nodes` | 新しいグループを作成してノードを入れる |
| `update_group` | グループ名・色を変更 |
| `move_nodes_to_group` | 既存グループに複数ノードをまとめて移動。`groupId: null` でグループ解除 |
| `delete_group` | グループを削除（`deleteNodes: true` でノードごと削除） |

### キャンバス操作

| ツール | 説明 |
|---|---|
| `layout_canvas` | ノードを自動配置。`"grid"` = 均等グリッド、`"cluster"` = グループ単位でまとめて配置 |
| `clear_canvas` | 全ノード・エッジ・グループを削除。⚠️ 不可逆 |

---

### 推奨エージェントフロー

```
1. get_canvas_summary            ← 規模・現状を把握
         ↓
2. list_groups                   ← グループ構成を把握
   search_nodes(query)           ← 関連概念の存在確認（重複防止）
   get_neighbors(nodeId)         ← 特定ノード周辺を深掘り
         ↓
3. bulk_add_nodes([...])         ← ノードをまとめて追加（IDを記録）
   bulk_connect_nodes([...])     ← エッジをまとめて接続（bulk_add_nodesのIDを使う）
         ↓
4. group_nodes(...)              ← 新グループを作成
   move_nodes_to_group(...)      ← 既存グループにノードを追加
         ↓
5. layout_canvas("cluster")      ← グループ単位で自動配置して整理
```

**`bulk_add_nodes` → `bulk_connect_nodes` パターンが基本：**

```
# 悪い例（N+1回のツール呼び出し）
add_node("React") → ID_A
add_node("Vue")   → ID_B
connect_nodes(ID_A, ID_B)

# 良い例（2回）
bulk_add_nodes(["React", "Vue", "Angular", ...]) → [ID_A, ID_B, ID_C, ...]
bulk_connect_nodes([{from: ID_A, to: ID_B}, ...])
```

---

### 使用例

```
# 既存コンテンツを把握してからアイデアを追加
"まずサマリーとグループ一覧を確認して、認証に関連するノードを検索してから、なければ追加して"

# グラフの構造を整理
"グラフ統計を確認して、孤立しているノードを見つけて関連するグループに入れて"

# 知識マップをまるごと構築
"Reactのエコシステムについて主要な概念を20個追加して、関連を矢印で結んで、テーマごとにグループ化してcluster配置して"

# 発散→収束サイクル
"このテーマについてアイデアを15個追加して。次に似たものをグループ化して、cluster配置して"
```

---

## Architecture

```
packages/
├── shared/        Zod スキーマ（CanvasNode, Edge, Group, SseEvent, MCP ツール型）
├── mcp-server/    Express + MCP Server（ポート 3000）
│   ├── REST API   /api/*          GUI からの操作
│   ├── SSE        /sse/canvas     AI の操作を GUI へリアルタイム配信
│   └── MCP SSE    /mcp/sse        AI agent のエントリポイント
├── frontend/      React + tldraw
└── cli/           brain-map コマンド
```

**設計のポイント：**
- GUI も AI（MCP）も同じ DB 関数を呼ぶ。操作の定義は1箇所のみ。
- AI がキャンバスを操作すると SSE で GUI に即反映される（`node:updated` 等のイベントを tldraw に直接適用）。
- セッションは `.brain-map` ファイル（SQLite）として保存。

---

## Development

```bash
npm install

# 全パッケージビルド
npm run build

# サーバー起動（MCP と REST API）
npm run dev:server

# フロントエンド起動（別ターミナル）
npm run dev:frontend

# 型チェック（全パッケージ）
npm run typecheck
```

開発時は `http://localhost:3000` にアクセスすると、サーバーから Vite（5173）へ自動プロキシされる。

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
