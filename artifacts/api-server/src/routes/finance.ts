import { Router, type IRouter } from "express";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  sql,
  sum,
} from "drizzle-orm";
import { db } from "@workspace/db";
import {
  categoriesTable,
  clinicSettingsTable,
  expensesTable,
} from "@workspace/db";
import {
  CreateCategoryBody,
  CreateCategoryResponse,
  CreateExpenseBody,
  CreateExpenseResponse,
  CreateCategoryResponse as CreatedCategoryResponse,
  DeleteCategoryParams,
  DeleteExpenseParams,
  GetDashboardSummaryQueryParams,
  GetDashboardSummaryResponse,
  GetSettingsResponse,
  ListCategoriesResponse,
  ListExpensesQueryParams,
  ListExpensesResponse,
  UpdateCategoryBody,
  UpdateCategoryParams,
  UpdateCategoryResponse,
  UpdateExpenseBody,
  UpdateExpenseParams,
  UpdateExpenseResponse,
  UpdateSettingsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const DEFAULT_SETTINGS = {
  clinicName: "ELO Clínica",
  monthlyBudget: 25000,
  ownerName: "Administração",
  email: "admin@eloclinica.com.br",
};

const parseId = (value: string | string[]): number => {
  const raw = Array.isArray(value) ? value[0] : value;
  return Number.parseInt(raw, 10);
};

const dateToYmd = (value: Date): string => value.toISOString().slice(0, 10);

const monthBounds = (month: string): { start: string; end: string } => {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year.toString().padStart(4, "0")}-${monthNumber
    .toString()
    .padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, monthNumber, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
};

const expenseSelection = {
  id: expensesTable.id,
  title: expensesTable.title,
  categoryId: expensesTable.categoryId,
  categoryName: categoriesTable.name,
  amount: expensesTable.amount,
  date: expensesTable.date,
  status: expensesTable.status,
  paymentMethod: expensesTable.paymentMethod,
  notes: expensesTable.notes,
  createdAt: expensesTable.createdAt,
};

async function getExpense(id: number) {
  const [expense] = await db
    .select(expenseSelection)
    .from(expensesTable)
    .innerJoin(
      categoriesTable,
      eq(expensesTable.categoryId, categoriesTable.id),
    )
    .where(eq(expensesTable.id, id))
    .limit(1);
  return expense;
}

async function getSettings() {
  let [settings] = await db
    .select()
    .from(clinicSettingsTable)
    .orderBy(asc(clinicSettingsTable.id))
    .limit(1);

  if (!settings) {
    [settings] = await db
      .insert(clinicSettingsTable)
      .values(DEFAULT_SETTINGS)
      .returning();
  }

  return settings;
}

async function getCategoryRows() {
  const rows = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      color: categoriesTable.color,
      expenseCount: count(expensesTable.id),
    })
    .from(categoriesTable)
    .leftJoin(expensesTable, eq(expensesTable.categoryId, categoriesTable.id))
    .groupBy(categoriesTable.id)
    .orderBy(asc(categoriesTable.name));

  return rows.map((row) => ({ ...row, expenseCount: Number(row.expenseCount) }));
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const rawMonth = Array.isArray(req.query.month)
    ? req.query.month[0]
    : req.query.month;
  const parsedQuery = GetDashboardSummaryQueryParams.safeParse(
    rawMonth ? { month: rawMonth } : {},
  );

  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const month = parsedQuery.data.month ?? new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(month);
  const settings = await getSettings();

  const monthExpenses = await db
    .select(expenseSelection)
    .from(expensesTable)
    .innerJoin(
      categoriesTable,
      eq(expensesTable.categoryId, categoriesTable.id),
    )
    .where(
      and(gte(expensesTable.date, start), lte(expensesTable.date, end)),
    )
    .orderBy(desc(expensesTable.date), desc(expensesTable.id));

  const totalSpent = monthExpenses.reduce(
    (total, expense) => total + Number(expense.amount),
    0,
  );
  const pendingAmount = monthExpenses
    .filter((expense) => expense.status === "pending")
    .reduce((total, expense) => total + Number(expense.amount), 0);

  const categoryTotals = new Map<
    number,
    { categoryId: number; categoryName: string; amount: number; color: string }
  >();
  for (const expense of monthExpenses) {
    const current = categoryTotals.get(expense.categoryId);
    if (current) {
      current.amount += Number(expense.amount);
    } else {
      const [category] = await db
        .select({ color: categoriesTable.color })
        .from(categoriesTable)
        .where(eq(categoriesTable.id, expense.categoryId))
        .limit(1);
      categoryTotals.set(expense.categoryId, {
        categoryId: expense.categoryId,
        categoryName: expense.categoryName,
        amount: Number(expense.amount),
        color: category?.color ?? "#8FA68C",
      });
    }
  }

  const byCategory = Array.from(categoryTotals.values())
    .sort((a, b) => b.amount - a.amount)
    .map((category) => ({
      ...category,
      percentage: totalSpent ? (category.amount / totalSpent) * 100 : 0,
    }));

  const trendRows = await db
    .select({
      month: sql<string>`to_char(${expensesTable.date}, 'YYYY-MM')`,
      amount: sum(expensesTable.amount),
    })
    .from(expensesTable)
    .where(
      gte(
        expensesTable.date,
        `${Number(month.slice(0, 4)) - 5}-01-01`,
      ),
    )
    .groupBy(sql`to_char(${expensesTable.date}, 'YYYY-MM')`)
    .orderBy(asc(sql`to_char(${expensesTable.date}, 'YYYY-MM')`));

  const monthlyTrend = trendRows.map((row) => ({
    label: row.month.slice(5),
    amount: Number(row.amount ?? 0),
  }));

  const response = {
    totalSpent,
    monthlyBudget: Number(settings.monthlyBudget),
    remainingBudget: Number(settings.monthlyBudget) - totalSpent,
    budgetUsedPct: settings.monthlyBudget
      ? (totalSpent / Number(settings.monthlyBudget)) * 100
      : 0,
    pendingAmount,
    expenseCount: monthExpenses.length,
    byCategory,
    monthlyTrend,
    recentExpenses: monthExpenses.slice(0, 6),
  };

  res.json(GetDashboardSummaryResponse.parse(response));
});

router.get("/expenses", async (req, res): Promise<void> => {
  const queryInput = {
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    categoryId:
      typeof req.query.categoryId === "string"
        ? req.query.categoryId
        : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
  };
  const parsedQuery = ListExpensesQueryParams.safeParse(queryInput);

  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const filters = [];
  if (parsedQuery.data.search) {
    filters.push(ilike(expensesTable.title, `%${parsedQuery.data.search}%`));
  }
  if (parsedQuery.data.categoryId) {
    filters.push(eq(expensesTable.categoryId, parsedQuery.data.categoryId));
  }
  if (parsedQuery.data.status) {
    filters.push(eq(expensesTable.status, parsedQuery.data.status));
  }

  const rows = await db
    .select(expenseSelection)
    .from(expensesTable)
    .innerJoin(
      categoriesTable,
      eq(expensesTable.categoryId, categoriesTable.id),
    )
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(expensesTable.date), desc(expensesTable.id));

  res.json(ListExpensesResponse.parse(rows));
});

router.post("/expenses", async (req, res): Promise<void> => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [created] = await db
    .insert(expensesTable)
    .values({
      ...parsed.data,
      date: dateToYmd(parsed.data.date),
      notes: parsed.data.notes ?? "",
    })
    .returning({ id: expensesTable.id });
  const expense = await getExpense(created.id);

  if (!expense) {
    res.status(500).json({ error: "Expense was created but could not be loaded" });
    return;
  }

  res.status(201).json(CreateExpenseResponse.parse(expense));
});

router.patch("/expenses/:id", async (req, res): Promise<void> => {
  const params = UpdateExpenseParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { date, ...rest } = parsed.data;
  const updateData = date ? { ...rest, date: dateToYmd(date) } : rest;
  const [updated] = await db
    .update(expensesTable)
    .set(updateData)
    .where(eq(expensesTable.id, params.data.id))
    .returning({ id: expensesTable.id });

  if (!updated) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }

  const expense = await getExpense(updated.id);
  if (!expense) {
    res.status(500).json({ error: "Expense could not be loaded" });
    return;
  }
  res.json(UpdateExpenseResponse.parse(expense));
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const params = DeleteExpenseParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const deleted = await db
    .delete(expensesTable)
    .where(eq(expensesTable.id, params.data.id))
    .returning({ id: expensesTable.id });

  if (!deleted[0]) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/categories", async (_req, res): Promise<void> => {
  res.json(ListCategoriesResponse.parse(await getCategoryRows()));
});

router.post("/categories", async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(categoriesTable)
    .values(parsed.data)
    .returning();
  const [category] = (await getCategoryRows()).filter(
    (row) => row.id === created.id,
  );
  res.status(201).json(CreatedCategoryResponse.parse(category));
});

router.patch("/categories/:id", async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse({ id: parseId(req.params.id) });
  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [updated] = await db
    .update(categoriesTable)
    .set(parsed.data)
    .where(eq(categoriesTable.id, params.data.id))
    .returning({ id: categoriesTable.id });
  if (!updated) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  const [category] = (await getCategoryRows()).filter(
    (row) => row.id === updated.id,
  );
  res.json(UpdateCategoryResponse.parse(category));
});

router.delete("/categories/:id", async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [usage] = await db
    .select({ total: count(expensesTable.id) })
    .from(expensesTable)
    .where(eq(expensesTable.categoryId, params.data.id));
  if (Number(usage?.total ?? 0) > 0) {
    res.status(400).json({ error: "Category is still in use" });
    return;
  }
  const deleted = await db
    .delete(categoriesTable)
    .where(eq(categoriesTable.id, params.data.id))
    .returning({ id: categoriesTable.id });
  if (!deleted[0]) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getSettings();
  res.json(GetSettingsResponse.parse(settings));
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const settings = await getSettings();
  const [updated] = await db
    .update(clinicSettingsTable)
    .set(parsed.data)
    .where(eq(clinicSettingsTable.id, settings.id))
    .returning();
  res.json(GetSettingsResponse.parse(updated));
});

export default router;