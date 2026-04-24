import type { ApiClient } from "./api.js";

export interface StoryAssertions {
  minNodes?: number;
  maxNodes?: number;
  minEdges?: number;
  minGroups?: number;
}

export interface Story {
  id: string;
  name: string;
  description: string;
  prompt: string;
  seed?: (api: ApiClient) => Promise<void>;
  checklist: string[];
  assertions?: StoryAssertions;
}
