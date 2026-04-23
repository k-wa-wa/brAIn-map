import type { Response } from "express";
import type { SseEvent } from "@brain-map/shared";

const clients = new Set<Response>();

export function addSseClient(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.add(res);
  res.on("close", () => clients.delete(res));
}

export function broadcast(event: SseEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    client.write(data);
  }
}
