import { useCallback, useRef } from "react";
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
import type { CanvasState, CanvasNode } from "@brain-map/shared";
import { api } from "./api.js";

// tldraw color values that map to our palette
const TLDRAW_COLOR_MAP: Record<string, string> = {
  yellow: "yellow",
  blue: "blue",
  green: "green",
  red: "red",
  purple: "violet",
  orange: "orange",
  pink: "pink",
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

function getTextFromProps(props: Record<string, unknown>, editor: Editor): string {
  const richText = props["richText"] as TLRichText | undefined;
  if (!richText) return "";
  return renderPlaintextFromRichText(editor, richText);
}

interface Props {
  canvas: CanvasState;
}

export function CanvasView({ canvas }: Props) {
  const editorRef = useRef<Editor | null>(null);
  // Track shape IDs that were created by syncing from the server (not by the user)
  const serverCreatedIds = useRef(new Set<string>());

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      if (canvas.nodes.length > 0) {
        const shapes = canvas.nodes.map(nodeToTldraw);
        // Mark these as server-originated so we don't re-save them
        shapes.forEach((s) => serverCreatedIds.current.add(s.id));
        editor.createShapes(shapes);
      }

      editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
        if (shape.type !== "note") return;
        if (serverCreatedIds.current.has(shape.id)) {
          serverCreatedIds.current.delete(shape.id);
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
        const text = getTextFromProps(next.props as Record<string, unknown>, editor);
        api
          .updateNode({ id: brainMapId, text, position: { x: next.x, y: next.y } })
          .catch(console.error);
      });

      editor.sideEffects.registerAfterDeleteHandler("shape", (shape) => {
        const brainMapId = (shape.meta as { brainMapId?: string }).brainMapId;
        if (!brainMapId) return;
        api.deleteNode(brainMapId).catch(console.error);
      });
    },
    [canvas]
  );

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
