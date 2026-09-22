-- Seed das 2 contas do painel (rode APÓS `pnpm --filter @workspace/db run push`).
-- Idempotente: não duplica nem altera contas existentes.
-- Ambas exigem troca de senha no primeiro acesso.

insert into app_users (username, pass_hash, role, must_change_password) values
  ('admin', '$2b$10$iro3/NOxXjHW4MbBBpU19.ee0ilqkXSnZ0H7xap97nQ0/pngZpimy', 'admin', true),
  ('tatiane.firme', '$2b$10$nOy1uWn2H/Gy8W.Du20ZQuQiUasAjoKZb0EfuO1daO3D/nKTCFygy', 'usuario', true)
on conflict (username) do nothing;
