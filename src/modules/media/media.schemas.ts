import { z } from "zod";

export const sendMediaSchema = z.object({
  groupId: z.string().uuid(),
  targetUserId: z.string().uuid().optional(),
});
