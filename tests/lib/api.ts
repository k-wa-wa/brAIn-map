import type { CanvasState, CanvasNode } from "@brain-map/shared";

export interface NodeSeedInput {
  text: string;
  color?: "yellow" | "blue" | "green" | "red" | "purple" | "orange" | "pink" | "gray";
  position?: { x: number; y: number };
}

export class ApiClient {
  constructor(readonly base: string) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${this.base}${path}`, init);
    if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}`);
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  getCanvas(): Promise<CanvasState> {
    return this.req<CanvasState>("GET", "/api/canvas");
  }

  addNode(input: NodeSeedInput): Promise<CanvasNode> {
    return this.req<CanvasNode>("POST", "/api/nodes", input);
  }

  getToolStats(): Promise<Record<string, number>> {
    return this.req<Record<string, number>>("GET", "/api/tool-stats");
  }

  resetToolStats(): Promise<void> {
    return this.req<void>("POST", "/api/tool-stats/reset");
  }

  isAlive(): Promise<boolean> {
    return fetch(`${this.base}/api/canvas`)
      .then((r) => r.ok)
      .catch(() => false);
  }
}
