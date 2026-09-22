import { numeric, pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clinicSettingsTable = pgTable("clinic_settings", {
  id: serial("id").primaryKey(),
  clinicName: text("clinic_name").notNull(),
  monthlyBudget: numeric("monthly_budget", {
    precision: 12,
    scale: 2,
    mode: "number",
  }).notNull(),
  ownerName: text("owner_name").notNull(),
  email: text("email").notNull(),
});

export const insertClinicSettingsSchema = createInsertSchema(
  clinicSettingsTable,
).omit({ id: true });

export type InsertClinicSettings = z.infer<typeof insertClinicSettingsSchema>;
export type ClinicSettings = typeof clinicSettingsTable.$inferSelect;