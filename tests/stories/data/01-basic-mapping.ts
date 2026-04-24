import type { Story } from "../../lib/types.js";

export const story: Story = {
  id: "01",
  name: "基本マッピング",
  description: "AIがトピックについて意味のあるノードを bulk_add_nodes で効率的に作成できるか確認する",

  prompt: `フロントエンドJavaScriptフレームワークのエコシステムについて、主要な概念・ツール・ライブラリを8個程度付箋で追加して。まずキャンバスの現状を確認してから追加すること。`,

  assertions: {
    minNodes: 6,
    maxNodes: 12,
  },

  checklist: [
    "ノードのテキストが意味のあるキーワードになっている（React / Vue / Vite 等）",
    "重複したテキストのノードが作られていない",
    "get_canvas_summary を最初に呼んでいる（ツール統計で確認）",
    "bulk_add_nodes が使われている（add_node の単発連呼ではない）",
  ],
};
