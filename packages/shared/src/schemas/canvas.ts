import { z } from "zod";

export const NodeColorSchema = z.enum([
  "yellow",
  "blue",
  "green",
  "red",
  "purple",
  "orange",
  "pink",
  "gray",
]);
export type NodeColor = z.infer<typeof NodeColorSchema>;

export const NodeTypeSchema = z.enum(["sticky", "text", "shape"]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Position = z.infer<typeof PositionSchema>;

export const CanvasNodeSchema = z.object({
  id: z.string(),
  type: NodeTypeSchema,
  text: z.string(),
  position: PositionSchema,
  width: z.number().positive().default(200),
  height: z.number().positive().default(200),
  color: NodeColorSchema.default("yellow"),
  groupId: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CanvasNode = z.infer<typeof CanvasNodeSchema>;

export const CanvasEdgeSchema = z.object({
  id: z.string(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  label: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
});
export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;

export const CanvasGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: NodeColorSchema.default("blue"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CanvasGroup = z.infer<typeof CanvasGroupSchema>;

export const CanvasStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  nodes: z.array(CanvasNodeSchema),
  edges: z.array(CanvasEdgeSchema),
  groups: z.array(CanvasGroupSchema),
  updatedAt: z.string().datetime(),
});
export type CanvasState = z.infer<typeof CanvasStateSchema>;

export const CameraStateSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});
export type CameraState = z.infer<typeof CameraStateSchema>;
