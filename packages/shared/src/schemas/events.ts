import { z } from "zod";
import { CanvasNodeSchema, CanvasEdgeSchema, CanvasGroupSchema, CanvasStateSchema } from "./canvas.js";

export const SseEventTypeSchema = z.enum([
  "node:added",
  "node:updated",
  "node:deleted",
  "edge:added",
  "edge:updated",
  "edge:deleted",
  "group:added",
  "group:updated",
  "group:deleted",
  "canvas:reset",
]);
export type SseEventType = z.infer<typeof SseEventTypeSchema>;

export const SseEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("node:added"), payload: CanvasNodeSchema }),
  z.object({ type: z.literal("node:updated"), payload: CanvasNodeSchema }),
  z.object({ type: z.literal("node:deleted"), payload: z.object({ id: z.string().uuid() }) }),
  z.object({ type: z.literal("edge:added"), payload: CanvasEdgeSchema }),
  z.object({ type: z.literal("edge:updated"), payload: CanvasEdgeSchema }),
  z.object({ type: z.literal("edge:deleted"), payload: z.object({ id: z.string().uuid() }) }),
  z.object({ type: z.literal("group:added"), payload: CanvasGroupSchema }),
  z.object({ type: z.literal("group:updated"), payload: CanvasGroupSchema }),
  z.object({ type: z.literal("group:deleted"), payload: z.object({ id: z.string().uuid() }) }),
  z.object({ type: z.literal("canvas:reset"), payload: CanvasStateSchema }),
]);
export type SseEvent = z.infer<typeof SseEventSchema>;
