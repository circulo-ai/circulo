import { z } from "zod";

export const deleteQuerySchema = z.object({
  id: z.uuid(),
});

export type DeleteQuery = z.infer<typeof deleteQuerySchema>;
