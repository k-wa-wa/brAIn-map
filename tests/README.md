# brAIn-map テストガイド

## 概要

AI の出力は非決定的なので「正解と完全一致」での自動テストは難しい。このテストスイートは以下を組み合わせた**半自動テスト**を採用している：

| 自動チェック | 人間が評価 |
|---|---|
| 構造的整合性（エッジが存在するノードを参照しているか等） | 内容の質・論理的適切さ |
| ツール呼び出し統計 + 効率性警告 | グループ名・エッジラベルの妥当性 |
| ノード数・エッジ数・グループ数の assertions | ブラウザでの視覚的確認 |

---

## セットアップ（初回のみ）

```bash
npm run build
```

---

## テスト実行

```bash
npm run story 01    # または 02 03 04 05
```

`BRAIN_MAP_PORT` で使用ポートを変更できる（デフォルト: 3001）：

```bash
BRAIN_MAP_PORT=4000 npm run story 03
```

### 実行の流れ

```
runner.ts 起動
  ↓
brain-map をポート 3001 に自動起動（毎回クリーンなファイル）
  ↓
seed 関数があればシードデータを投入
  ↓
[PRE-STATE] 初期状態を表示
  ↓
claude -p "..." で Claude を実行（MCP 設定を自動注入）
  ↓
[POST-STATE] 変更後の状態 + 構造チェック + assertions
  ↓
[TOOL CALL STATS] 呼び出し回数の棒グラフ + 効率性警告
  ↓
[EVALUATION CHECKLIST] チェックリスト表示
  ↓
ブラウザ http://localhost:3001 で視覚確認
  ↓
pass / fail / skip を入力 → results.log に記録
```

---

## ファイル構成

```
tests/
├── runner.ts                  # メイン CLI（ここを実行する）
├── lib/
│   ├── types.ts               # Story インターフェース定義
│   ├── api.ts                 # brain-map REST API クライアント
│   ├── checks.ts              # 構造的整合性チェック・assertions
│   ├── display.ts             # ターミナル出力
│   └── server.ts              # brain-map プロセス管理
└── stories/
    ├── 01-basic-mapping.ts    # 基本ノード追加
    ├── 02-graph-building.ts   # エッジ接続・グラフ構築
    ├── 03-group-organize.ts   # グループ整理（シードあり）
    ├── 04-search-update.ts    # 検索・接続（シードあり）
    └── 05-full-cycle.ts       # 発散→収束フルサイクル
```

---

## ストーリー一覧

| ID | ストーリー | 初期状態 | 評価の焦点 |
|---|---|---|---|
| `01` | 基本マッピング | 空 | ノードの質・bulk 使用 |
| `02` | グラフ構築 | 空 | エッジの関連性・bulk 効率 |
| `03` | グループ整理 | 15 ノード（混在） | グループ化・cluster 配置 |
| `04` | 検索・更新 | 10 ノード（中心+関連+無関係） | search 精度・接続の正確さ |
| `05` | 発散→収束フルサイクル | 空 | 一連作業の完結・全体効率 |

---

## 新しいストーリーの追加

`tests/stories/06-new-story.ts` を作成して `story` を export するだけ：

```ts
import type { Story } from "../lib/types.js";
import type { ApiClient } from "../lib/api.js";

export const story: Story = {
  id: "06",
  name: "ストーリー名",
  description: "このストーリーが確認すること",
  prompt: "Claude に送るプロンプト",
  seed: async (api: ApiClient) => {
    await api.addNode({ text: "初期ノード", color: "yellow" });
  },
  assertions: { minNodes: 5, minEdges: 2 },
  checklist: [
    "チェック項目1",
    "チェック項目2",
  ],
};
```

その後 `runner.ts` の `loaders` マップに `"06"` を追加する。

---

## 結果の蓄積

```bash
cat tests/results.log
# 2026-04-24T09:12:00Z  PASS  01-基本マッピング  bulk使用OK、ノード数9個
# 2026-04-24T09:25:00Z  FAIL  02-グラフ構築      connect_nodesを8回単発呼び出し
```

---

## トラブルシューティング

**`claude: command not found`**  
Claude Code CLI が PATH にない。`npm install -g @anthropic-ai/claude-code` でインストール。

**`--mcp-config` フラグが使えない**  
Claude Code のバージョンによっては `--mcp-config` がない場合がある。その場合はプロジェクトの `.claude/settings.json` に手動で設定する：

```json
{
  "mcpServers": {
    "brain-map": { "type": "sse", "url": "http://localhost:3001/mcp/sse" }
  }
}
```

**サーバーが起動しない**  
`npm run build` が済んでいるか確認。`packages/cli/bin/brain-map.js` が存在するか確認。
