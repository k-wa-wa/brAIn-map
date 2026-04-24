import { useCallback, useEffect, useRef } from "react";
import {
  Tldraw,
  createShapeId,
  toRichText,
  renderPlaintextFromRichText,
  type Editor,
  type TLShapeId,
  type TLRichText,
} from "tldraw";
import "tldraw/tldraw.css";
import type { CanvasState, CanvasNode, CanvasEdge, SseEvent } from "@brain-map/shared";
import { api } from "./api.js";

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

function nodeToTldraw(node: CanvasNode) {
  return {
    id: createShapeId(node.id) as TLShapeId,
    type: "note" as const,
    x: node.position.x,
    y: node.position.y,
    props: {
      richText: toRichText(node.text),
      color: (TLDRAW_COLOR_MAP[node.color] ?? "yellow") as "yellow",
      size: "m" as const,
    },
    meta: { brainMapId: node.id },
  };
}

function edgeToTldraw(edge: CanvasEdge) {
  return {
    id: createShapeId(edge.id) as TLShapeId,
    type: "arrow" as const,
    x: 0,
    y: 0,
    props: {
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      text: edge.label || "",
    },
    meta: { brainMapEdgeId: edge.id },
  };
}

function getTextFromProps(props: Record<string, unknown>, editor: Editor): string {
  const richText = props["richText"] as TLRichText | undefined;
  if (!richText) return "";
  return renderPlaintextFromRichText(editor, richText);
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

interface Props {
  canvas: CanvasState;
  lastEvent: SseEvent | null;
}

export function CanvasView({ canvas, lastEvent }: Props) {
  const editorRef = useRef<Editor | null>(null);
  // Tracks shape IDs of operations originated from the server so side-effect handlers skip them
  const serverOriginatedIds = useRef(new Set<string>());

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      const shapes = [];
      const bindings: unknown[] = [];

      if (canvas.nodes.length > 0) {
        shapes.push(...canvas.nodes.map(nodeToTldraw));
      }

      if (canvas.edges.length > 0) {
        shapes.push(...canvas.edges.map(edgeToTldraw));
        for (const edge of canvas.edges) {
          bindings.push(...edgeBindings(edge));
        }
      }

      if (shapes.length > 0) {
        shapes.forEach((s) => serverOriginatedIds.current.add(s.id));
        editor.createShapes(shapes);
      }

      if (bindings.length > 0) {
        editor.createBindings(bindings as any);
      }

      editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
        if (shape.type !== "note") return;
        if (serverOriginatedIds.current.has(shape.id)) {
          serverOriginatedIds.current.delete(shape.id);
          return;
        }
        const text = getTextFromProps(shape.props as Record<string, unknown>, editor);
        api
          .addNode({ type: "sticky", text, position: { x: shape.x, y: shape.y } })
          .catch(console.error);
      });

      editor.sideEffects.registerAfterChangeHandler("shape", (prev, next) => {
        const brainMapId = (next.meta as { brainMapId?: string }).brainMapId;
        if (!brainMapId) return;
        if (serverOriginatedIds.current.has(next.id)) {
          serverOriginatedIds.current.delete(next.id);
          return;
        }
        const text = getTextFromProps(next.props as Record<string, unknown>, editor);
        api
          .updateNode({ id: brainMapId, text, position: { x: next.x, y: next.y } })
          .catch(console.error);
      });

      editor.sideEffects.registerAfterDeleteHandler("shape", (shape) => {
        if (serverOriginatedIds.current.has(shape.id)) {
          serverOriginatedIds.current.delete(shape.id);
          return;
        }
        const brainMapId = (shape.meta as { brainMapId?: string }).brainMapId;
        if (!brainMapId) return;
        api.deleteNode(brainMapId).catch(console.error);
      });
    },
    [canvas]
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
        editor.createShapes([shape]);
        break;
      }
      case "node:updated": {
        const shapeId = createShapeId(lastEvent.payload.id) as TLShapeId;
        if (!editor.getShape(shapeId)) return;
        serverOriginatedIds.current.add(shapeId);
        editor.updateShapes([{
          id: shapeId,
          type: "note",
          x: lastEvent.payload.position.x,
          y: lastEvent.payload.position.y,
          props: {
            richText: toRichText(lastEvent.payload.text),
            color: (TLDRAW_COLOR_MAP[lastEvent.payload.color] ?? "yellow") as "yellow",
          },
        }]);
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
        editor.createShapes([shape]);
        editor.createBindings(edgeBindings(lastEvent.payload) as any);
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
        const allNew = [...nodeShapes, ...edgeShapes];
        allNew.forEach((s) => serverOriginatedIds.current.add(s.id));
        if (allNew.length > 0) editor.createShapes(allNew);

        const bindings: unknown[] = [];
        for (const edge of lastEvent.payload.edges) bindings.push(...edgeBindings(edge));
        if (bindings.length > 0) editor.createBindings(bindings as any);
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
