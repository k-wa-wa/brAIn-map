import type {
  CanvasState,
  CanvasNode,
  CanvasEdge,
  CanvasGroup,
  AddNodeInput,
  UpdateNodeInput,
  ConnectNodesInput,
  CameraState,
} from "@brain-map/shared";

const BASE = "/api";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  getCanvas: () => req<CanvasState>("GET", "/canvas"),
  addNode: (input: AddNodeInput) => req<CanvasNode>("POST", "/nodes", input),
  updateNode: ({ id, ...rest }: UpdateNodeInput) => req<CanvasNode>("PATCH", `/nodes/${id}`, rest),
  deleteNode: (id: string) => req<void>("DELETE", `/nodes/${id}`),
  connectNodes: (input: ConnectNodesInput) => req<CanvasEdge>("POST", "/edges", input),
  updateEdge: ({ id, ...rest }: { id: string; label?: string }) => req<CanvasEdge>("PATCH", `/edges/${id}`, rest),
  deleteEdge: (id: string) => req<void>("DELETE", `/edges/${id}`),
  groupNodes: (input: { nodeIds: string[]; groupName: string; color?: string }) =>
    req<CanvasGroup>("POST", "/groups", input),
  deleteGroup: (id: string, deleteNodes = false) =>
    req<void>("DELETE", `/groups/${id}?deleteNodes=${deleteNodes}`),
  getCamera: (sessionId: string) => req<CameraState>("GET", `/camera/${sessionId}`),
  updateCamera: (sessionId: string, camera: CameraState) => req<void>("PUT", `/camera/${sessionId}`, camera),
};
