import type { Story } from "../../lib/types.js";

export const story: Story = {
  id: "02",
  name: "グラフ構築",
  description: "ノード追加とエッジ接続を bulk 操作で組み合わせて効率的に行えるか確認する",

  prompt: `ソフトウェアアーキテクチャのパターンについての知識マップを作って。モノリス・マイクロサービス・イベント駆動・CQRS・ヘキサゴナルアーキテクチャなど主要なパターンを10個以上追加して、パターン間の関係（「に発展する」「と組み合わせる」「から分離する」等）をエッジで結んで。`,

  assertions: {
    minNodes: 8,
    minEdges: 5,
  },

  checklist: [
    "エッジの向きが意味を成している（AはBに発展する、等）",
    "孤立ノード（どのエッジにも繋がっていないもの）が2個以下",
    "bulk_add_nodes が使われている",
    "bulk_connect_nodes が使われている（connect_nodes の単発連呼ではない）",
    "bulk_add_nodes のレスポンスIDを使って bulk_connect_nodes しているはず（IDの参照ミスがない）",
  ],
};
