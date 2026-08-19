import { z } from "zod";

const fields = {
  name: z.string().trim().min(1).max(32),
  emoji: z.string().trim().min(1).max(16),
  displayOrder: z.number().int().min(0).max(10_000),
  isActive: z.boolean(),
};

export const createReactionSchema = z.object(fields);
export const updateReactionSchema = z.object(fields).partial().refine((value) => Object.keys(value).length > 0);
