import { useCanvasStore } from "./useCanvasStore.js";
import { CanvasView } from "./CanvasView.js";

export function App() {
  const { canvas } = useCanvasStore();

  if (!canvas) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8f8f8",
          fontSize: 18,
          color: "#666",
        }}
      >
        Loading canvas...
      </div>
    );
  }

  return <CanvasView canvas={canvas} />;
}
