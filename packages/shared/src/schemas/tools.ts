import { z } from "zod";
import { NodeColorSchema, NodeTypeSchema, PositionSchema } from "./canvas.js";

// --- Inputs ---

export const AddNodeInputSchema = z.object({
  text: z.string().min(1),
  type: NodeTypeSchema.default("sticky"),
  color: NodeColorSchema.optional(),
  position: PositionSchema.optional(),
  groupId: z.string().uuid().optional(),
});
export type AddNodeInput = z.infer<typeof AddNodeInputSchema>;

export const UpdateNodeInputSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1).optional(),
  color: NodeColorSchema.optional(),
  position: PositionSchema.optional(),
  groupId: z.string().uuid().nullable().optional(),
});
export type UpdateNodeInput = z.infer<typeof UpdateNodeInputSchema>;

export const DeleteNodeInputSchema = z.object({
  id: z.string().uuid(),
});
export type DeleteNodeInput = z.infer<typeof DeleteNodeInputSchema>;

export const ConnectNodesInputSchema = z.object({
  fromNodeId: z.string().uuid(),
  toNodeId: z.string().uuid(),
  label: z.string().optional(),
});
export type ConnectNodesInput = z.infer<typeof ConnectNodesInputSchema>;

export const DeleteEdgeInputSchema = z.object({
  id: z.string().uuid(),
});
export type DeleteEdgeInput = z.infer<typeof DeleteEdgeInputSchema>;

export const GroupNodesInputSchema = z.object({
  nodeIds: z.array(z.string().uuid()).min(1),
  groupName: z.string().min(1),
  color: NodeColorSchema.optional(),
});
export type GroupNodesInput = z.infer<typeof GroupNodesInputSchema>;

export const DeleteGroupInputSchema = z.object({
  id: z.string().uuid(),
  deleteNodes: z.boolean().default(false),
});
export type DeleteGroupInput = z.infer<typeof DeleteGroupInputSchema>;

export const GetCanvasStateInputSchema = z.object({});
export type GetCanvasStateInput = z.infer<typeof GetCanvasStateInputSchema>;

// --- Outputs ---

export const ToolSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export const ToolErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export type ToolError = z.infer<typeof ToolErrorSchema>;
