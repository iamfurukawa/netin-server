import { z } from "zod";

export const groupNameSchema = z.string().trim().min(1).max(40);

export const createGroupSchema = z.object({
  name: groupNameSchema,
  registrationsOpen: z.boolean().optional(),
});

export const updateGroupSchema = z.object({
  name: groupNameSchema.optional(),
  registrationsOpen: z.boolean().optional(),
}).refine((value) => value.name !== undefined || value.registrationsOpen !== undefined, {
  message: "at_least_one_field_required",
});
