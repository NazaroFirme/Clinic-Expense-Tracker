import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Usuários do painel (login real). Apenas contas criadas por seed/migração —
// sem cadastro público.
export const appUsersTable = pgTable("app_users", {
  // sempre minúsculo (ex.: 'admin', 'tatiane.firme')
  username: text("username").primaryKey(),
  passHash: text("pass_hash").notNull(),
  role: text("role").notNull().default("usuario"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Sessões por cookie httpOnly. O id guarda o sha256 hex do token;
// o token em claro nunca é persistido.
export const appSessionsTable = pgTable("app_sessions", {
  id: text("id").primaryKey(),
  username: text("username")
    .notNull()
    .references(() => appUsersTable.username, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AppUser = typeof appUsersTable.$inferSelect;
export type AppSession = typeof appSessionsTable.$inferSelect;
