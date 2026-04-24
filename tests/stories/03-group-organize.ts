import type { Story } from "../lib/types.js";
import type { ApiClient } from "../lib/api.js";

async function seed(api: ApiClient): Promise<void> {
  const nodes = [
    { text: "React",             color: "yellow" },
    { text: "Vue.js",            color: "yellow" },
    { text: "TypeScript",        color: "blue"   },
    { text: "Docker",            color: "blue"   },
    { text: "Kubernetes",        color: "blue"   },
    { text: "CI/CD",             color: "green"  },
    { text: "テスト駆動開発",     color: "green"  },
    { text: "コードレビュー",     color: "green"  },
    { text: "PostgreSQL",        color: "orange" },
    { text: "Redis",             color: "orange" },
    { text: "REST API",          color: "purple" },
    { text: "GraphQL",           color: "purple" },
    { text: "スクラム",           color: "pink"   },
    { text: "モブプログラミング", color: "pink"   },
    { text: "ペアプログラミング", color: "pink"   },
  ] as const;

  for (const n of nodes) {
    await api.addNode(n);
  }
}

export const story: Story = {
  id: "03",
  name: "グループ整理",
  description: "15個の混在ノードをAIがテーマ別にグループ化し cluster 配置で整理できるか確認する",

  prompt: `今のキャンバスにあるノードをテーマごとにグループ化して、その後cluster配置で整理して。グループ名は内容を的確に表す日本語にして。`,

  seed,

  assertions: {
    minGroups: 2,
  },

  checklist: [
    "グループ名がテーマを適切に表している（フロントエンド / インフラ / プロセス 等）",
    "各グループのノードがそのテーマに合致している",
    "1グループあたりのノード数が1〜7個程度（バランスが取れている）",
    "list_nodes または get_canvas_state でノードを把握してからグループを作っている",
    "layout_canvas(\"cluster\") が使われている",
    "ブラウザでグループごとにノードが視覚的にまとまって配置されている（要目視確認）",
  ],
};
