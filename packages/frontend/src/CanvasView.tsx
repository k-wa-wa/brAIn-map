import { useCallback, useEffect, useRef } from "react";
import {
  Tldraw,
  createShapeId,
  toRichText,
  renderPlaintextFromRichText,
  type Editor,
  type TLShapeId,
  type TLRichText,
  type TLShape,
  type TLBinding,
  type TLArrowShape,
  type TLNoteShape,
  type TLShapePartial,
  type TLDefaultColorStyle,
} from "tldraw";
import "tldraw/tldraw.css";
import type { CanvasState, CanvasNode, CanvasEdge, SseEvent, NodeColor } from "@brain-map/shared";
import { api } from "./api.js";

type BrainMapMeta = {
  brainMapId?: string;
  brainMapEdgeId?: string;
};

const TLDRAW_COLOR_MAP: Record<string, string> = {
  yellow: "yellow",
  blue: "blue",
  green: "green",
  red: "red",
  purple: "violet",
  orange: "orange",
  pink: "light-red",
  gray: "grey",
} as const;

const REVERSE_COLOR_MAP: Record<string, NodeColor> = Object.fromEntries(
  Object.entries(TLDRAW_COLOR_MAP).map(([k, v]) => [v, k as NodeColor])
);

function nodeToTldraw(node: CanvasNode): TLShapePartial<TLNoteShape> {
  return {
    id: createShapeId(node.id) as TLShapeId,
    type: "note",
    x: node.position.x,
    y: node.position.y,
    props: {
      richText: toRichText(node.text),
      color: (TLDRAW_COLOR_MAP[node.color] ?? "yellow") as TLDefaultColorStyle,
      size: "m",
    },
    meta: { brainMapId: node.id },
  };
}

function edgeToTldraw(edge: CanvasEdge): TLShapePartial<TLArrowShape> {
  return {
    id: createShapeId(edge.id) as TLShapeId,
    type: "arrow",
    x: 0,
    y: 0,
    props: {
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      richText: toRichText(edge.label || ""),
    },
    meta: { brainMapEdgeId: edge.id },
  };
}

function edgeBindings(edge: CanvasEdge) {
  const arrowId = createShapeId(edge.id);
  return [
    {
      type: "arrow",
      fromId: arrowId,
      toId: createShapeId(edge.fromNodeId),
      props: { terminal: "start", normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: true },
    },
    {
      type: "arrow",
      fromId: arrowId,
      toId: createShapeId(edge.toNodeId),
      props: { terminal: "end", normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: true },
    },
  ];
}

function getTextFromProps(props: unknown, editor: Editor): string {
  const p = props as Record<string, unknown>;
  const richText = p["richText"] as TLRichText | undefined;
  if (!richText) return (p["label"] as string) || (p["text"] as string) || "";
  return renderPlaintextFromRichText(editor, richText);
}

interface Props {
  canvas: CanvasState;
  lastEvent: SseEvent | null;
}

const clientId = localStorage.getItem("brain-map-client-id") || (() => {
  const id = Math.random().toString(36).substring(2, 10);
  localStorage.setItem("brain-map-client-id", id);
  return id;
})();

const tabId = sessionStorage.getItem("brain-map-tab-id") || (() => {
  const id = Math.random().toString(36).substring(2, 10);
  sessionStorage.setItem("brain-map-tab-id", id);
  return id;
})();

const sessionId = `${clientId}:${tabId}`;

export function CanvasView({ canvas, lastEvent }: Props) {
  const editorRef = useRef<Editor | null>(null);
  // Tracks shape IDs of operations originated from the server so side-effect handlers skip them
  const serverOriginatedIds = useRef(new Set<string>());
  // Timers for debouncing updates
  const pendingUpdates = useRef(new Map<string, number>());

  const debounce = (id: string, fn: () => void, delay = 500) => {
    if (pendingUpdates.current.has(id)) {
      clearTimeout(pendingUpdates.current.get(id));
    }
    pendingUpdates.current.set(id, window.setTimeout(() => {
      pendingUpdates.current.delete(id);
      fn();
    }, delay));
  };

  const syncArrowBindings = useCallback((editor: Editor, arrowId: TLShapeId) => {
    const arrow = editor.getShape(arrowId);
    if (!arrow || arrow.type !== "arrow") return;

    const bindings = editor.getBindingsFromShape(arrow, "arrow");
    const startBinding = bindings.find((b) => b.props.terminal === "start");
    const endBinding = bindings.find((b) => b.props.terminal === "end");

    const startNodeId = startBinding ? (editor.getShape(startBinding.toId)?.meta as BrainMapMeta)?.brainMapId : null;
    const endNodeId = endBinding ? (editor.getShape(endBinding.toId)?.meta as BrainMapMeta)?.brainMapId : null;

    const brainMapEdgeId = (arrow.meta as BrainMapMeta)?.brainMapEdgeId;

    if (startNodeId && endNodeId) {
      if (!brainMapEdgeId) {
        // New connection
        api.connectNodes({
          id: arrow.id.replace(/^shape:/, ""),
          fromNodeId: startNodeId,
          toNodeId: endNodeId,
          label: getTextFromProps(arrow.props, editor)
        }).then(edge => {
          serverOriginatedIds.current.add(arrow.id);
          editor.updateShape({
            id: arrow.id,
            type: "arrow",
            meta: { brainMapEdgeId: edge.id }
          } as TLShapePartial);
        }).catch(console.error);
      }
    } else if (brainMapEdgeId) {
      // Connection lost
      api.deleteEdge(brainMapEdgeId).then(() => {
        serverOriginatedIds.current.add(arrow.id);
        editor.updateShape({
          id: arrow.id,
          type: "arrow",
          meta: { brainMapEdgeId: undefined }
        } as TLShapePartial);
      }).catch(console.error);
    }
  }, []);

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      const shapes: TLShape[] = [];
      const bindings: TLBinding[] = [];

      if (canvas.nodes.length > 0) {
        shapes.push(...(canvas.nodes.map(nodeToTldraw) as TLShape[]));
      }
      if (canvas.edges.length > 0) {
        shapes.push(...(canvas.edges.map(edgeToTldraw) as TLShape[]));
        for (const edge of canvas.edges) {
          bindings.push(...(edgeBindings(edge) as unknown as TLBinding[]));
        }
      }

      if (shapes.length > 0) {
        shapes.forEach((s) => serverOriginatedIds.current.add(s.id));
        editor.createShapes(shapes);
      }

      if (bindings.length > 0) {
        editor.createBindings(bindings);
      }

      // Restore camera
      api.getCamera(sessionId).then(camera => {
        if (camera) {
          editor.setCamera({ x: camera.x, y: camera.y, z: camera.zoom });
        }
      }).catch(console.error);

      // Save camera on change
      const unlisten = editor.store.listen((entry) => {
        // Only trigger if camera actually moved (simplified check)
        const camera = editor.getCamera();
        debounce("camera", () => {
          api.updateCamera(sessionId, { x: camera.x, y: camera.y, zoom: camera.z }).catch(console.error);
        }, 1000);
      }, { scope: "session", source: "user" });

      // --- Node Handlers ---
      editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
        if (shape.type !== "note") return;
        if (serverOriginatedIds.current.has(shape.id)) {
          serverOriginatedIds.current.delete(shape.id);
          return;
        }
        const text = getTextFromProps(shape.props, editor);
        const color = REVERSE_COLOR_MAP[(shape.props as TLNoteShape["props"]).color] ?? "yellow";
        api
          .addNode({
            id: shape.id.replace(/^shape:/, ""),
            type: "sticky",
            text,
            color,
            position: { x: shape.x, y: shape.y },
          })
          .then((node) => {
            serverOriginatedIds.current.add(shape.id);
            editor.updateShape({
              id: shape.id,
              type: "note",
              meta: { brainMapId: node.id },
            } as TLShapePartial);
          })
          .catch(console.error);
      });

      editor.sideEffects.registerAfterChangeHandler("shape", (prev, next) => {
        if (serverOriginatedIds.current.has(next.id)) {
          serverOriginatedIds.current.delete(next.id);
          return;
        }

        if (next.type === "note") {
          const brainMapId = (next.meta as BrainMapMeta).brainMapId;
          if (!brainMapId) return;
          
          debounce(next.id, () => {
            const text = getTextFromProps(next.props, editor);
            const color = REVERSE_COLOR_MAP[(next.props as TLNoteShape["props"]).color] ?? "yellow";
            api
              .updateNode({ id: brainMapId, text, color, position: { x: next.x, y: next.y } })
              .catch(console.error);
          });
        } else if (next.type === "arrow") {
          const brainMapEdgeId = (next.meta as BrainMapMeta).brainMapEdgeId;
          if (!brainMapEdgeId) return;

          debounce(next.id, () => {
            const label = getTextFromProps(next.props, editor);
            api.updateEdge({ id: brainMapEdgeId, label }).catch(console.error);
          });
        }
      });

      editor.sideEffects.registerAfterDeleteHandler("shape", (shape) => {
        if (serverOriginatedIds.current.has(shape.id)) {
          serverOriginatedIds.current.delete(shape.id);
          return;
        }
        const brainMapId = (shape.meta as BrainMapMeta).brainMapId;
        if (brainMapId) {
          api.deleteNode(brainMapId).catch(console.error);
        }
        const brainMapEdgeId = (shape.meta as BrainMapMeta).brainMapEdgeId;
        if (brainMapEdgeId) {
          api.deleteEdge(brainMapEdgeId).catch(console.error);
        }
      });

      // --- Binding Handlers (for Edges) ---
      editor.sideEffects.registerAfterCreateHandler("binding", (binding) => {
        if (binding.type !== "arrow") return;
        syncArrowBindings(editor, binding.fromId);
      });

      editor.sideEffects.registerAfterChangeHandler("binding", (prev, next) => {
        if (next.type !== "arrow") return;
        syncArrowBindings(editor, next.fromId);
      });

      editor.sideEffects.registerAfterDeleteHandler("binding", (binding) => {
        if (binding.type !== "arrow") return;
        syncArrowBindings(editor, binding.fromId);
      });

      return () => {
        unlisten();
      };
    },
    [canvas, syncArrowBindings]
  );

  // Apply live SSE events from MCP / other clients directly to the tldraw editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !lastEvent) return;

    switch (lastEvent.type) {
      case "node:added": {
        const shapeId = createShapeId(lastEvent.payload.id) as TLShapeId;
        if (editor.getShape(shapeId)) return;
        const shape = nodeToTldraw(lastEvent.payload);
        serverOriginatedIds.current.add(shape.id);
        editor.createShapes([shape as TLShape]);
        break;
      }
      case "node:updated": {
        const shapeId = createShapeId(lastEvent.payload.id) as TLShapeId;
        const existing = editor.getShape(shapeId);
        if (!existing) return;
        
        serverOriginatedIds.current.add(shapeId);
        editor.updateShapes([{
          id: shapeId,
          type: "note",
          x: lastEvent.payload.position.x,
          y: lastEvent.payload.position.y,
          props: {
            richText: toRichText(lastEvent.payload.text),
            color: (TLDRAW_COLOR_MAP[lastEvent.payload.color] ?? "yellow") as TLDefaultColorStyle,
          },
        } as TLShapePartial]);
        break;
      }
      case "node:deleted": {
        const shapeId = createShapeId(lastEvent.payload.id) as TLShapeId;
        if (!editor.getShape(shapeId)) return;
        serverOriginatedIds.current.add(shapeId);
        editor.deleteShapes([shapeId]);
        break;
      }
      case "edge:added": {
        const shapeId = createShapeId(lastEvent.payload.id) as TLShapeId;
        if (editor.getShape(shapeId)) return;
        const shape = edgeToTldraw(lastEvent.payload);
        serverOriginatedIds.current.add(shapeId);
        editor.createShapes([shape as TLShape]);
        editor.createBindings(edgeBindings(lastEvent.payload) as unknown as TLBinding[]);
        break;
      }
      case "edge:updated": {
        const shapeId = createShapeId(lastEvent.payload.id) as TLShapeId;
        if (!editor.getShape(shapeId)) return;
        serverOriginatedIds.current.add(shapeId);
        editor.updateShapes([{
          id: shapeId,
          props: { richText: toRichText(lastEvent.payload.label || "") }
        } as TLShapePartial]);
        break;
      }
      case "edge:deleted": {
        const shapeId = createShapeId(lastEvent.payload.id) as TLShapeId;
        if (!editor.getShape(shapeId)) return;
        serverOriginatedIds.current.add(shapeId);
        editor.deleteShapes([shapeId]);
        break;
      }
      case "canvas:reset": {
        const allShapes = editor.getCurrentPageShapes();
        allShapes.forEach((s) => serverOriginatedIds.current.add(s.id));
        if (allShapes.length > 0) editor.deleteShapes(allShapes.map((s) => s.id));

        const nodeShapes = lastEvent.payload.nodes.map(nodeToTldraw);
        const edgeShapes = lastEvent.payload.edges.map(edgeToTldraw);
        const allNew = [...nodeShapes, ...edgeShapes] as TLShape[];
        allNew.forEach((s) => serverOriginatedIds.current.add(s.id));
        if (allNew.length > 0) editor.createShapes(allNew);

        const bindings: TLBinding[] = [];
        for (const edge of lastEvent.payload.edges) bindings.push(...(edgeBindings(edge) as unknown as TLBinding[]));
        if (bindings.length > 0) editor.createBindings(bindings);
        break;
      }
    }
  }, [lastEvent]);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 500,
          background: "rgba(0,0,0,0.6)",
          color: "white",
          padding: "4px 14px",
          borderRadius: 20,
          fontSize: 13,
          pointerEvents: "none",
        }}
      >
        {canvas.name} — {canvas.nodes.length} nodes · AI操作はターミナルから
      </div>
      <Tldraw onMount={onMount} />
    </div>
  );
}
