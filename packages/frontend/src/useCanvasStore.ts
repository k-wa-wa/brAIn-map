import { useEffect, useReducer, useState } from "react";
import type { CanvasState, SseEvent } from "@brain-map/shared";
import { SseEventSchema } from "@brain-map/shared";
import { api } from "./api.js";

type State = CanvasState | null;

type Action = SseEvent | { type: "init"; payload: CanvasState };

function reducer(state: State, action: Action): State {
  if (action.type === "init") return action.payload;
  if (!state) return state;

  switch (action.type) {
    case "node:added":
      return { ...state, nodes: [...state.nodes, action.payload] };
    case "node:updated":
      return { ...state, nodes: state.nodes.map((n) => (n.id === action.payload.id ? action.payload : n)) };
    case "node:deleted":
      return {
        ...state,
        nodes: state.nodes.filter((n) => n.id !== action.payload.id),
        edges: state.edges.filter((e) => e.fromNodeId !== action.payload.id && e.toNodeId !== action.payload.id),
      };
    case "edge:added":
      return { ...state, edges: [...state.edges, action.payload] };
    case "edge:deleted":
      return { ...state, edges: state.edges.filter((e) => e.id !== action.payload.id) };
    case "group:added":
      return { ...state, groups: [...state.groups, action.payload] };
    case "group:updated":
      return { ...state, groups: state.groups.map((g) => (g.id === action.payload.id ? action.payload : g)) };
    case "group:deleted":
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.payload.id),
        nodes: state.nodes.map((n) => (n.groupId === action.payload.id ? { ...n, groupId: null } : n)),
      };
    case "canvas:reset":
      return action.payload;
    default:
      return state;
  }
}

export function useCanvasStore() {
  const [canvas, dispatch] = useReducer(reducer, null);
  const [lastEvent, setLastEvent] = useState<SseEvent | null>(null);

  useEffect(() => {
    api.getCanvas().then((state) => dispatch({ type: "init", payload: state }));

    const es = new EventSource("/sse/canvas");
    es.onmessage = (e: MessageEvent<string>) => {
      const parsed = SseEventSchema.safeParse(JSON.parse(e.data));
      if (parsed.success) {
        dispatch(parsed.data);
        setLastEvent(parsed.data);
      }
    };
    return () => es.close();
  }, []);

  return { canvas, dispatch, lastEvent };
}
