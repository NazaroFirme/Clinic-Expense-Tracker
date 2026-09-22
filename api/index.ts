// Entrada serverless (Vercel): reutiliza o app Express da api-server.
// Rotas /api/* caem aqui via rewrites do vercel.json.
// Requer env DATABASE_URL em runtime (lida pelo @workspace/db).
import app from "../artifacts/api-server/src/app";

export default app;
