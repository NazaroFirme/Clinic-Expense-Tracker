import {
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";

export const expensesTable = pgTable("clinic_expenses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categoriesTable.id),
  amount: numeric("amount", {
    precision: 12,
    scale: 2,
    mode: "number",
  }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  status: text("status").notNull().default("paid"),
  paymentMethod: text("payment_method").notNull().default("pix"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;