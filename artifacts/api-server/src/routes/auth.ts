import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, eq, gt, lt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { appSessionsTable, appUsersTable } from "@workspace/db";

const router: IRouter = Router();

export const SESSION_COOKIE = "elo_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const BCRYPT_COST = 10;

// Rate limit simples em memória para o login (10 tentativas/min por IP)
const attempts = new Map<string, { count: number; resetAt: number }>();
function loginAllowed(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 10;
}

export type SessionUser = { username: string; role: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const normalizeUsername = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

async function createSession(username: string, res: Response): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const id = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(appSessionsTable).values({ id, username, expiresAt });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

async function destroySession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token) {
    const id = createHash("sha256").update(token).digest("hex");
    await db.delete(appSessionsTable).where(eq(appSessionsTable.id, id)).catch(() => {});
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

// Limpeza oportunista de sessões expiradas (best-effort, não bloqueia login)
async function sweepExpiredSessions(): Promise<void> {
  await db
    .delete(appSessionsTable)
    .where(lt(appSessionsTable.expiresAt, new Date()))
    .catch(() => {});
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || !token) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const id = createHash("sha256").update(token).digest("hex");
    const [session] = await db
      .select()
      .from(appSessionsTable)
      .where(and(eq(appSessionsTable.id, id), gt(appSessionsTable.expiresAt, new Date())))
      .limit(1);
    if (!session) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const [user] = await db
      .select({
        username: appUsersTable.username,
        role: appUsersTable.role,
      })
      .from(appUsersTable)
      .where(eq(appUsersTable.username, session.username))
      .limit(1);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    req.user = { username: user.username, role: user.role };
    next();
  } catch {
    res.status(500).json({ error: "auth_unavailable" });
  }
}

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const ip = req.ip ?? "unknown";
  if (!loginAllowed(ip)) {
    res.status(429).json({ error: "too_many_attempts" });
    return;
  }
  const username = normalizeUsername(req.body?.username);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!/^[a-z0-9._-]{3,30}$/.test(username) || !password) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  const [user] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.username, username))
    .limit(1);
  if (!user || !(await bcrypt.compare(password, user.passHash))) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  await destroySession(req, res).catch(() => {});
  await createSession(user.username, res);
  void sweepExpiredSessions();
  res.json({
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });
});

router.post("/logout", async (req: Request, res: Response): Promise<void> => {
  await destroySession(req, res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const [user] = await db
    .select({
      username: appUsersTable.username,
      role: appUsersTable.role,
      mustChangePassword: appUsersTable.mustChangePassword,
    })
    .from(appUsersTable)
    .where(eq(appUsersTable.username, req.user!.username))
    .limit(1);
  if (!user) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  res.json(user);
});

router.post("/change-password", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const currentPassword =
    typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  if (newPassword.length < 6 || newPassword.length > 100) {
    res.status(400).json({ error: "new_password_min_6" });
    return;
  }
  const [user] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.username, req.user!.username))
    .limit(1);
  if (!user || !(await bcrypt.compare(currentPassword, user.passHash))) {
    res.status(401).json({ error: "current_password_mismatch" });
    return;
  }
  const passHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await db
    .update(appUsersTable)
    .set({ passHash, mustChangePassword: false })
    .where(eq(appUsersTable.username, user.username));
  // Rotaciona a sessão após a troca
  await destroySession(req, res).catch(() => {});
  await createSession(user.username, res);
  res.json({ ok: true });
});

export default router;
