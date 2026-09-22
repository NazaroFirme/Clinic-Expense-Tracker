import { Router, type IRouter } from "express";
import authRouter, { requireAuth } from "./auth";
import healthRouter from "./health";
import financeRouter from "./finance";

const router: IRouter = Router();

router.use(healthRouter);
// Login/logout/sessão abertos; todo o financeiro exige sessão válida.
router.use(authRouter);
router.use(requireAuth, financeRouter);

export default router;
