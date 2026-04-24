import type { Story } from "../../lib/types.js";
import type { ApiClient } from "../../lib/api.js";

async function seed(api: ApiClient): Promise<void> {
  await api.addNode({ text: "パフォーマンス最適化", color: "yellow", position: { x: 400, y: 300 } });

  // 関連ノード（接続されるべき）
  const related = [
    { text: "キャッシュ戦略",          color: "blue"  },
    { text: "データベースインデックス", color: "blue"  },
    { text: "CDN",                     color: "blue"  },
    { text: "遅延ローディング",         color: "green" },
    { text: "非同期処理",              color: "green" },
    { text: "バンドルサイズ削減",       color: "green" },
  ] as const;

  // 無関係ノード（接続されるべきではない）
  const unrelated = [
    { text: "スクラム",           color: "pink"   },
    { text: "デザインシステム",   color: "orange" },
    { text: "チームビルディング", color: "pink"   },
  ] as const;

  for (const n of [...related, ...unrelated]) {
    await api.addNode(n);
  }
}

export const story: Story = {
  id: "04",
  name: "検索・更新",
  description: "search_nodes で関連ノードを見つけて適切に接続できるか、無関係なものを接続しないか確認する",

  prompt: `キャンバスにある「パフォーマンス最適化」というノードを中心に、関連するノードを探して矢印で繋いで。関係のないノードは無視してOK。接続するときはラベルで関係を説明して（例：「の手段」「を改善する」等）。`,

  seed,

  assertions: {
    minEdges: 3,
  },

  checklist: [
    "search_nodes が使われている（ツール統計で確認）",
    "キャッシュ戦略・データベースインデックス・CDN等がパフォーマンス最適化に接続されている",
    "スクラム・デザインシステム・チームビルディングが接続されていない",
    "エッジにラベルが付いている",
    "重複するノードを新規作成せずに既存ノードを使っている",
  ],
};
