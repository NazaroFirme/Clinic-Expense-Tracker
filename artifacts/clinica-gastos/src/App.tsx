import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useRoute } from 'wouter';
import {
  ArrowDownRight, BarChart3, Bell, Check, CheckCircle2, ChevronRight,
  CircleDollarSign, FileText, Filter, HelpCircle, LayoutDashboard, Loader2,
  Mail, Pencil, PieChart, Plus, ReceiptText, Search, Settings as SettingsIcon,
  Trash2, TrendingUp, Wallet, X, Zap,
} from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey, getGetSettingsQueryKey, getListCategoriesQueryKey,
  getListExpensesQueryKey, useCreateCategory, useCreateExpense, useDeleteCategory,
  useDeleteExpense, useGetDashboardSummary, useGetSettings, useListCategories,
  useListExpenses, useUpdateCategory, useUpdateExpense, useUpdateSettings,
  type Category, type Expense, type ExpenseStatus, type PaymentMethod,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const fullDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
const monthKey = new Date().toISOString().slice(0, 7);
const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date());
const categoryColors = ['#D97962', '#5A8C7B', '#D4A653', '#6F82A7', '#A4779A', '#8A9B65'];

type ExpenseForm = {
  title: string; categoryId: string; amount: string; date: string; status: ExpenseStatus;
  paymentMethod: PaymentMethod; notes: string;
};
type CategoryForm = { name: string; color: string };

const emptyExpense: ExpenseForm = {
  title: '', categoryId: '', amount: '', date: new Date().toISOString().slice(0, 10),
  status: 'paid', paymentMethod: 'pix', notes: '',
};

function formatMonth(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${value}-02T12:00:00`));
}

function expenseDateValue(value: Date | string) {
  const raw = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(raw.getTime())) return new Date();
  return new Date(`${raw.toISOString().slice(0, 10)}T12:00:00`);
}

function expenseDateInputValue(value: Date | string) {
  return expenseDateValue(value).toISOString().slice(0, 10);
}

function initials(name?: string) {
  return (name || 'Ana Martins').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

function useFinanceActions() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
    qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  };
  return { qc, refresh };
}

function Brand() {
  return <Link href="/dashboard" className="flex items-center gap-3 no-underline" data-testid="link-brand">
    <span className="brand-mark">e</span>
    <span><span className="brand-name block">ELO Clínica</span><span className="brand-sub block">gestão financeira</span></span>
  </Link>;
}

const navItems = [
  { href: '/dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/expenses', label: 'Despesas', icon: ReceiptText },
  { href: '/categories', label: 'Categorias', icon: PieChart },
  { href: '/reports', label: 'Relatórios', icon: BarChart3 },
];

function Navigation({ mobile = false }: { mobile?: boolean }) {
  const [location] = useLocation();
  return <nav className={mobile ? 'mobile-nav' : 'flex flex-col'}>
    {navItems.map(({ href, label, icon: Icon }) => <Link
      key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replace(' ', '-')}`}
      className={`nav-link ${location === href ? 'active' : ''}`}
    ><Icon /><span>{label}</span></Link>)}
  </nav>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [info, setInfo] = useState<'help' | 'notifications' | null>(null);
  const settings = useGetSettings();
  const clinic = settings.data?.clinicName || 'ELO Clínica';
  const owner = settings.data?.ownerName || 'Ana Martins';
  const title = location === '/dashboard' ? 'Visão geral' : navItems.find((item) => item.href === location)?.label || 'Configurações';
  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <div className="nav-label">Navegação</div>
      <Navigation />
      <div className="nav-label">Clínica</div>
      <Link href="/settings" className={`nav-link ${location === '/settings' ? 'active' : ''}`} data-testid="link-nav-configuracoes"><SettingsIcon /><span>Configurações</span></Link>
      <div className="sidebar-footer">
        <div className="owner-chip"><span className="avatar">{initials(owner)}</span><span><strong className="block">{owner}</strong><small className="block" style={{ color: 'hsl(39 30% 72%)' }}>{clinic}</small></span></div>
      </div>
    </aside>
    <div className="main-wrap">
      <header className="topbar">
        <div><div className="top-kicker">ELO Clínica / financeiro</div><div className="top-title">{title}</div></div>
        <div className="flex items-center gap-3">
          <span className="top-kicker hidden sm:block">{new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span>
          <button className="btn btn-ghost" aria-label="Ajuda" onClick={() => setInfo('help')} data-testid="button-help"><HelpCircle /></button>
          <button className="btn btn-ghost" aria-label="Notificações" onClick={() => setInfo('notifications')} data-testid="button-notifications"><Bell /></button>
        </div>
      </header>
      <main>{children}</main>
      <Navigation mobile />
    </div>
    {info === 'help' && <Modal title="Como podemos ajudar?" onClose={() => setInfo(null)}><p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))', lineHeight: 1.6 }}>Registre uma despesa assim que ela acontecer. No fim do mês, use os relatórios para conversar sobre os próximos passos da clínica.</p><div className="modal-footer"><button className="btn btn-primary" onClick={() => setInfo(null)} data-testid="button-close-help">Entendi</button></div></Modal>}
    {info === 'notifications' && <Modal title="Tudo em ordem" onClose={() => setInfo(null)}><div className="flex gap-3 items-start"><CheckCircle2 style={{ color: 'hsl(var(--primary))', flex: 'none' }} /><p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))', lineHeight: 1.6, margin: 0 }}>Você não tem novos avisos. Quando houver algo importante sobre seu orçamento, avisaremos por aqui.</p></div><div className="modal-footer"><button className="btn btn-primary" onClick={() => setInfo(null)} data-testid="button-close-notifications">Fechar</button></div></Modal>}
  </div>;
}

function LoadingState({ rows = 3 }: { rows?: number }) {
  return <div className="panel" style={{ padding: 22 }} data-testid="state-loading">
    {Array.from({ length: rows }).map((_, index) => <div key={index} className="flex items-center gap-3" style={{ padding: '14px 0', borderBottom: index < rows - 1 ? '1px solid hsl(var(--border))' : 0 }}>
      <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 9 }} /><div className="flex-1"><div className="skeleton" style={{ width: `${45 + index * 12}%`, height: 10, marginBottom: 7 }} /><div className="skeleton" style={{ width: '28%', height: 8 }} /></div><div className="skeleton" style={{ width: 65, height: 12 }} />
    </div>)}
  </div>;
}

function ErrorState({ retry }: { retry: () => void }) {
  return <div className="empty-state panel" data-testid="state-error"><div className="empty-icon"><Zap /></div><strong>Não conseguimos carregar agora</strong><span>Confira sua conexão e tente novamente.</span><br /><button className="btn btn-secondary" onClick={retry} data-testid="button-retry">Tentar novamente</button></div>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state" data-testid="state-empty"><div className="empty-icon"><ReceiptText /></div><strong>{title}</strong><span>{description}</span>{action && <div style={{ marginTop: 17 }}>{action}</div>}</div>;
}

function MetricCard({ icon: Icon, label, value, note, accent }: { icon: typeof Wallet; label: string; value: string; note?: string; accent?: boolean }) {
  return <div className="metric-card" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="metric-label"><Icon />{label}</div><div className="metric-value" style={accent ? { color: 'hsl(12 61% 49%)' } : undefined}>{value}</div>{note && <div className="metric-note">{note}</div>}</div>;
}

function Dashboard() {
  const summary = useGetDashboardSummary({ month: monthKey });
  const [location, setLocation] = useLocation();
  const data = summary.data;
  const trendMax = Math.max(...(data?.monthlyTrend || []).map((item) => item.amount), 1);
  if (summary.isLoading) return <Page><PageIntro eyebrow="seu mês em foco" title="Visão geral" description="Acompanhe as decisões financeiras da clínica com calma." /><LoadingState rows={4} /></Page>;
  if (summary.isError || !data) return <Page><PageIntro eyebrow="seu mês em foco" title="Visão geral" description="Acompanhe as decisões financeiras da clínica com calma." /><ErrorState retry={() => summary.refetch()} /></Page>;
  return <Page>
    <PageIntro eyebrow={monthLabel} title="Bom dia, Ana." description="Aqui está o pulso financeiro da clínica. Um passo de cada vez." action={<button className="btn btn-primary" onClick={() => setLocation('/expenses?new=1')} data-testid="button-add-expense"><Plus /> Registrar despesa</button>} />
    <div className="grid metrics-grid">
      <MetricCard icon={Wallet} label="Total gasto" value={money.format(data.totalSpent)} note={`${data.expenseCount} lançamentos no mês`} />
      <MetricCard icon={TrendingUp} label="Orçamento utilizado" value={`${data.budgetUsedPct.toFixed(1)}%`} note={`de ${money.format(data.monthlyBudget)} planejados`} accent />
      <MetricCard icon={ArrowDownRight} label="Ainda disponível" value={money.format(data.remainingBudget)} note={data.remainingBudget >= 0 ? 'dentro do orçamento' : 'acima do orçamento'} />
      <MetricCard icon={CircleDollarSign} label="A pagar" value={money.format(data.pendingAmount)} note="despesas pendentes" />
    </div>
    <div className="grid dashboard-grid">
      <section className="panel" data-testid="panel-monthly-trend">
        <div className="flex items-start justify-between"><div><div className="panel-title">Ritmo de gastos</div><div className="panel-sub">Quanto saiu da clínica nos últimos meses</div></div><Link href="/reports" className="btn btn-ghost" data-testid="link-see-reports">Ver relatório <ChevronRight /></Link></div>
        <div className="chart-wrap"><div className="chart-y"><span>{money.format(trendMax)}</span><span>{money.format(trendMax / 2)}</span><span>R$ 0</span></div><div className="chart">{data.monthlyTrend.map((item) => <div className="chart-bar" key={item.label} style={{ height: `${Math.max(5, (item.amount / trendMax) * 86)}%` }}><span className="chart-label">{item.label}</span></div>)}</div></div>
      </section>
      <section className="panel" data-testid="panel-category-breakdown"><div className="panel-title">Para onde vai o dinheiro</div><div className="panel-sub">Distribuição por categoria em {formatMonth(monthKey)}</div>
        <div className="breakdown-list">{data.byCategory.length ? data.byCategory.slice(0, 5).map((item) => <div className="breakdown-row" key={item.categoryId}><div className="breakdown-name"><span className="color-dot" style={{ background: item.color }} />{item.categoryName}</div><div className="breakdown-amount">{money.format(item.amount)}</div><div className="breakdown-track"><div className="breakdown-fill" style={{ width: `${Math.min(100, item.percentage)}%`, background: item.color }} /></div></div>) : <EmptyState title="Ainda sem categorias" description="Registre sua primeira despesa para ver o panorama." />}</div>
      </section>
    </div>
    <section className="panel recent-panel" data-testid="panel-recent-expenses">
      <div className="flex items-start justify-between"><div><div className="panel-title">Lançamentos recentes</div><div className="panel-sub">Os últimos movimentos registrados</div></div><Link href="/expenses" className="btn btn-ghost" data-testid="link-all-expenses">Ver todos <ChevronRight /></Link></div>
      <ExpenseTable expenses={data.recentExpenses.slice(0, 5)} compact />
    </section>
  </Page>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-heading">{title}</h1><p className="page-intro">{description}</p></div>{action}</div>;
}

function Page({ children }: { children: ReactNode }) {
  return <div className="content">{children}</div>;
}

function ExpenseTable({ expenses, compact = false, onEdit, onDelete }: { expenses: Expense[]; compact?: boolean; onEdit?: (expense: Expense) => void; onDelete?: (expense: Expense) => void }) {
  if (!expenses.length) return <EmptyState title="Nenhuma despesa por aqui" description="Quando você registrar um gasto, ele aparecerá nesta lista." />;
  return <div style={{ overflowX: 'auto' }}><table className="table" data-testid="table-expenses"><thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Status</th><th className="text-right">Valor</th>{!compact && <th aria-label="Ações" />}</tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id} data-testid={`row-expense-${expense.id}`}><td><div className="expense-title">{expense.title}</div>{!compact && expense.notes && <div className="expense-meta">{expense.notes}</div>}</td><td><span className="flex items-center gap-2"><span className="color-dot" style={{ background: expense.categoryName ? categoryColors[expense.categoryId % categoryColors.length] : '#789' }} />{expense.categoryName}</span></td><td>{date.format(expenseDateValue(expense.date))}</td><td><span className={`badge ${expense.status === 'paid' ? 'badge-paid' : 'badge-pending'}`}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />{expense.status === 'paid' ? 'Pago' : 'Pendente'}</span></td><td className="amount text-right">{money.format(expense.amount)}</td>{!compact && <td><div className="actions"><button className="btn btn-ghost" onClick={() => onEdit?.(expense)} aria-label={`Editar ${expense.title}`} data-testid={`button-edit-expense-${expense.id}`}><Pencil /></button><button className="btn btn-ghost" onClick={() => onDelete?.(expense)} aria-label={`Excluir ${expense.title}`} data-testid={`button-delete-expense-${expense.id}`}><Trash2 /></button></div></td>}</tr>)}</tbody></table></div>;
}

function ExpenseModal({ expense, categories, onClose, onSaved }: { expense?: Expense; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const { refresh } = useFinanceActions();
  const [form, setForm] = useState<ExpenseForm>(expense ? { title: expense.title, categoryId: String(expense.categoryId), amount: String(expense.amount), date: expenseDateInputValue(expense.date), status: expense.status, paymentMethod: expense.paymentMethod, notes: expense.notes || '' } : { ...emptyExpense, categoryId: categories[0] ? String(categories[0].id) : '' });
  const [error, setError] = useState('');
  const pending = create.isPending || update.isPending;
  const set = (key: keyof ExpenseForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.categoryId || Number(form.amount) <= 0) { setError('Preencha descrição, categoria e um valor válido.'); return; }
    const body = { title: form.title.trim(), categoryId: Number(form.categoryId), amount: Number(form.amount), date: form.date, status: form.status, paymentMethod: form.paymentMethod, notes: form.notes.trim() };
    const options = { onSuccess: () => { refresh(); onSaved(); onClose(); } };
    if (expense) update.mutate({ id: expense.id, data: body }, options);
    else create.mutate({ data: body }, options);
  };
  return <Modal title={expense ? 'Editar despesa' : 'Nova despesa'} onClose={onClose}><form onSubmit={submit}><div className="form-grid">
    <div className="field full"><label htmlFor="expense-title">O que foi pago?</label><input id="expense-title" className="input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Materiais de curativo" data-testid="input-expense-title" autoFocus /></div>
    <div className="field"><label htmlFor="expense-category">Categoria</label><select id="expense-category" className="select" style={{ width: '100%' }} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} data-testid="select-expense-category"><option value="">Selecione...</option>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></div>
    <div className="field"><label htmlFor="expense-amount">Valor</label><input id="expense-amount" className="input" type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0,00" data-testid="input-expense-amount" /></div>
    <div className="field"><label htmlFor="expense-date">Data</label><input id="expense-date" className="input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} data-testid="input-expense-date" /></div>
    <div className="field"><label htmlFor="expense-status">Status</label><select id="expense-status" className="select" style={{ width: '100%' }} value={form.status} onChange={(e) => set('status', e.target.value)} data-testid="select-expense-status"><option value="paid">Pago</option><option value="pending">Pendente</option></select></div>
    <div className="field"><label htmlFor="expense-payment">Forma de pagamento</label><select id="expense-payment" className="select" style={{ width: '100%' }} value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} data-testid="select-expense-payment"><option value="pix">Pix</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option><option value="transfer">Transferência</option><option value="cash">Dinheiro</option></select></div>
    <div className="field full"><label htmlFor="expense-notes">Observação <span style={{ color: 'hsl(var(--muted-foreground))', fontWeight: 400 }}>(opcional)</span></label><textarea id="expense-notes" className="textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Algum detalhe para lembrar depois?" rows={3} data-testid="textarea-expense-notes" /></div>
  </div>{error && <div className="text-sm mt-3" style={{ color: 'hsl(var(--destructive))' }} data-testid="status-form-error">{error}</div>}<div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose} data-testid="button-cancel-expense">Cancelar</button><button className="btn btn-primary" disabled={pending} data-testid="button-save-expense">{pending ? <Loader2 className="animate-spin" /> : <Check />} {expense ? 'Salvar alterações' : 'Salvar despesa'}</button></div></form></Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true"><div className="modal-head"><div><div className="eyebrow">ELO Clínica</div><h2>{title}</h2></div><button className="btn btn-ghost" onClick={onClose} aria-label="Fechar" data-testid="button-close-modal"><X /></button></div><div className="modal-body">{children}</div></div></div>;
}

function Expenses() {
  const [location, setLocation] = useLocation();
  const categories = useListCategories();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState<{ mode: 'new' | 'edit'; expense?: Expense } | null>(null);
  const [toast, setToast] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const params = useMemo(() => ({ search: search || undefined, categoryId: categoryId ? Number(categoryId) : undefined, status: (status || undefined) as ExpenseStatus | undefined }), [search, categoryId, status]);
  const expenses = useListExpenses(params);
  const deleter = useDeleteExpense();
  useEffect(() => { if (new URLSearchParams(window.location.search).get('new')) setModal({ mode: 'new' }); }, []);
  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(() => setToast(false), 2600); return () => window.clearTimeout(timer); }, [toast]);
  const { refresh } = useFinanceActions();
  const remove = () => { if (!deleteTarget) return; deleter.mutate({ id: deleteTarget.id }, { onSuccess: () => { refresh(); setDeleteTarget(null); setToast(true); } }); };
  return <Page>
    <PageIntro eyebrow="movimentações" title="Despesas" description="Registre cada saída e mantenha uma visão honesta do caixa." action={<button className="btn btn-primary" onClick={() => setModal({ mode: 'new' })} data-testid="button-new-expense"><Plus /> Nova despesa</button>} />
    <div className="toolbar"><div className="search-wrap"><Search /><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por descrição..." data-testid="input-search-expenses" /></div><div className="flex items-center gap-2"><Filter style={{ width: 15, color: 'hsl(var(--muted-foreground))' }} /><select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} data-testid="select-filter-category"><option value="">Todas as categorias</option>{(categories.data || []).map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select><select className="select" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-filter-status"><option value="">Todos os status</option><option value="paid">Pagas</option><option value="pending">Pendentes</option></select></div></div>
    <div className="panel table-panel">{expenses.isLoading ? <LoadingState rows={5} /> : expenses.isError ? <ErrorState retry={() => expenses.refetch()} /> : <ExpenseTable expenses={expenses.data || []} onEdit={(expense) => setModal({ mode: 'edit', expense })} onDelete={setDeleteTarget} />}</div>
    {modal && <ExpenseModal expense={modal.expense} categories={categories.data || []} onClose={() => { setModal(null); setLocation('/expenses'); }} onSaved={() => setToast(true)} />}
    {deleteTarget && <Modal title="Excluir despesa?" onClose={() => setDeleteTarget(null)}><div className="py-2"><p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Você está prestes a remover <strong style={{ color: 'hsl(var(--foreground))' }}>{deleteTarget.title}</strong> de {money.format(deleteTarget.amount)}. Essa ação não pode ser desfeita.</p></div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete">Manter lançamento</button><button className="btn btn-danger" onClick={remove} disabled={deleter.isPending} data-testid="button-confirm-delete">{deleter.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} Excluir</button></div></Modal>}
    {toast && <SuccessToast message="Despesa salva com cuidado." />}
  </Page>;
}

function CategoryModal({ category, onClose }: { category?: Category; onClose: () => void }) {
  const create = useCreateCategory(); const update = useUpdateCategory(); const { refresh } = useFinanceActions();
  const [form, setForm] = useState<CategoryForm>({ name: category?.name || '', color: category?.color || categoryColors[0] });
  const pending = create.isPending || update.isPending;
  const submit = (event: FormEvent) => { event.preventDefault(); if (!form.name.trim()) return; const done = { onSuccess: () => { refresh(); onClose(); } }; if (category) update.mutate({ id: category.id, data: form }, done); else create.mutate({ data: form }, done); };
  return <Modal title={category ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}><form onSubmit={submit}><div className="field"><label htmlFor="category-name">Nome da categoria</label><input id="category-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Insumos clínicos" data-testid="input-category-name" autoFocus /></div><div className="field" style={{ marginTop: 18 }}><label>Cor de identificação</label><div className="flex items-center gap-2">{categoryColors.map((color) => <button type="button" key={color} aria-label={`Selecionar cor ${color}`} onClick={() => setForm({ ...form, color })} data-testid={`button-color-${color.slice(1)}`} style={{ width: 30, height: 30, borderRadius: 9, border: form.color === color ? '3px solid hsl(var(--foreground))' : '2px solid transparent', background: color, cursor: 'pointer' }} />)}<input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ width: 30, height: 30, padding: 0, border: 0 }} data-testid="input-category-color" /></div></div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose} data-testid="button-cancel-category">Cancelar</button><button className="btn btn-primary" disabled={pending} data-testid="button-save-category">{pending ? <Loader2 className="animate-spin" /> : <Check />} Salvar categoria</button></div></form></Modal>;
}

function Categories() {
  const categories = useListCategories(); const deleter = useDeleteCategory(); const { refresh } = useFinanceActions();
  const [modal, setModal] = useState<{ category?: Category } | null>(null); const [deleteTarget, setDeleteTarget] = useState<Category | null>(null); const [toast, setToast] = useState(false);
  const remove = () => { if (!deleteTarget) return; deleter.mutate({ id: deleteTarget.id }, { onSuccess: () => { refresh(); setDeleteTarget(null); setToast(true); } }); };
  return <Page><PageIntro eyebrow="organização" title="Categorias" description="Uma linguagem simples para entender onde a clínica investe seu dinheiro." action={<button className="btn btn-primary" onClick={() => setModal({})} data-testid="button-new-category"><Plus /> Nova categoria</button>} />
    {categories.isLoading ? <LoadingState rows={4} /> : categories.isError ? <ErrorState retry={() => categories.refetch()} /> : <div className="grid category-grid">{(categories.data || []).length ? (categories.data || []).map((category) => <div className="panel category-card" key={category.id} data-testid={`card-category-${category.id}`}><div className="category-actions"><button className="btn btn-ghost" onClick={() => setModal({ category })} aria-label={`Editar ${category.name}`} data-testid={`button-edit-category-${category.id}`}><Pencil /></button><button className="btn btn-ghost" onClick={() => setDeleteTarget(category)} aria-label={`Excluir ${category.name}`} data-testid={`button-delete-category-${category.id}`}><Trash2 /></button></div><div className="category-swatch" style={{ background: category.color }} /><div className="category-name">{category.name}</div><div className="category-count">{category.expenseCount} {category.expenseCount === 1 ? 'lançamento' : 'lançamentos'}</div></div>) : <div className="panel" style={{ gridColumn: '1 / -1' }}><EmptyState title="Crie sua primeira categoria" description="Categorias ajudam a transformar gastos do dia a dia em decisões melhores." action={<button className="btn btn-primary" onClick={() => setModal({})} data-testid="button-empty-new-category"><Plus /> Nova categoria</button>} /></div>}</div>}
    {modal && <CategoryModal category={modal.category} onClose={() => { setModal(null); setToast(true); }} />}
    {deleteTarget && <Modal title="Excluir categoria?" onClose={() => setDeleteTarget(null)}><p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Remover <strong style={{ color: 'hsl(var(--foreground))' }}>{deleteTarget.name}</strong>? Despesas já registradas não serão apagadas, mas perderão esta referência.</p><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete-category">Cancelar</button><button className="btn btn-danger" onClick={remove} data-testid="button-confirm-delete-category"><Trash2 /> Excluir categoria</button></div></Modal>}
    {toast && <SuccessToast message="Categorias atualizadas." />}
  </Page>;
}

function Reports() {
  const summary = useGetDashboardSummary({ month: monthKey }); const data = summary.data; const max = Math.max(...(data?.monthlyTrend || []).map((item) => item.amount), 1);
  if (summary.isLoading) return <Page><PageIntro eyebrow="leituras do caixa" title="Relatórios" description="Veja padrões para decidir com mais segurança." /><LoadingState rows={5} /></Page>;
  if (summary.isError || !data) return <Page><PageIntro eyebrow="leituras do caixa" title="Relatórios" description="Veja padrões para decidir com mais segurança." /><ErrorState retry={() => summary.refetch()} /></Page>;
  return <Page><PageIntro eyebrow="leituras do caixa" title="Relatórios" description="Veja padrões para decidir com mais segurança." action={<button className="btn btn-secondary" onClick={() => window.print()} data-testid="button-print-report"><FileText /> Imprimir relatório</button>} />
    <div className="grid report-grid"><div><div className="report-hero"><div className="eyebrow" style={{ color: 'hsl(39 30% 78%)' }}>{formatMonth(monthKey)}</div><div className="metric-value">{money.format(data.totalSpent)}</div><p style={{ color: 'hsl(39 30% 78%)', fontSize: 12, maxWidth: 320, lineHeight: 1.5 }}>O que a clínica movimentou até aqui. Compare os meses e ajuste o próximo passo.</p><div className="flex items-center gap-2" style={{ marginTop: 22, fontSize: 11 }}><span className="badge" style={{ background: 'hsl(39 44% 96% / .12)', color: 'hsl(39 44% 96%)' }}>{data.budgetUsedPct.toFixed(1)}% do orçamento</span>{data.remainingBudget >= 0 ? <span style={{ color: 'hsl(39 30% 78%)' }}>dentro do planejado</span> : <span style={{ color: 'hsl(12 70% 72%)' }}>revise o orçamento</span>}</div></div><section className="panel" style={{ marginTop: 15 }}><div className="panel-title">Evolução mensal</div><div className="panel-sub">Total de despesas por período</div><div className="chart-wrap" style={{ height: 260 }}><div className="chart-y"><span>{money.format(max)}</span><span>{money.format(max / 2)}</span><span>R$ 0</span></div><div className="chart">{data.monthlyTrend.map((item) => <div className="chart-bar" key={item.label} style={{ height: `${Math.max(5, (item.amount / max) * 86)}%` }}><span className="chart-label">{item.label}</span></div>)}</div></div></section></div><section className="panel"><div className="panel-title">Composição dos gastos</div><div className="panel-sub">Participação de cada categoria</div><div className="breakdown-list">{data.byCategory.map((item) => <div className="breakdown-row" key={item.categoryId}><div className="breakdown-name"><span className="color-dot" style={{ background: item.color }} />{item.categoryName}</div><div className="breakdown-amount">{item.percentage.toFixed(1)}%</div><div className="breakdown-track"><div className="breakdown-fill" style={{ width: `${item.percentage}%`, background: item.color }} /></div><div className="expense-meta" style={{ gridColumn: '1 / -1' }}>{money.format(item.amount)}</div></div>)}</div></section></div>
  </Page>;
}

function Settings() {
  const settings = useGetSettings(); const update = useUpdateSettings(); const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ clinicName: '', monthlyBudget: '', ownerName: '', email: '' });
  useEffect(() => { if (settings.data) setForm({ clinicName: settings.data.clinicName, monthlyBudget: String(settings.data.monthlyBudget), ownerName: settings.data.ownerName, email: settings.data.email }); }, [settings.data]);
  const submit = (event: FormEvent) => { event.preventDefault(); update.mutate({ data: { clinicName: form.clinicName, monthlyBudget: Number(form.monthlyBudget), ownerName: form.ownerName, email: form.email } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); setSaved(true); window.setTimeout(() => setSaved(false), 2600); } }); };
  if (settings.isLoading) return <Page><PageIntro eyebrow="preferências" title="Configurações" description="Deixe o espaço com a cara da sua clínica." /><LoadingState rows={4} /></Page>;
  if (settings.isError) return <Page><PageIntro eyebrow="preferências" title="Configurações" description="Deixe o espaço com a cara da sua clínica." /><ErrorState retry={() => settings.refetch()} /></Page>;
  return <Page><PageIntro eyebrow="preferências" title="Configurações" description="Deixe o espaço com a cara da sua clínica." /><form className="settings-form" onSubmit={submit}><section className="panel settings-section"><div className="panel-title">Identidade da clínica</div><div className="panel-sub">Essas informações aparecem na sua área de trabalho.</div><div className="form-grid"><div className="field full"><label htmlFor="settings-clinic">Nome da clínica</label><input id="settings-clinic" className="input" value={form.clinicName} onChange={(e) => setForm({ ...form, clinicName: e.target.value })} data-testid="input-settings-clinic" /></div><div className="field"><label htmlFor="settings-owner">Responsável</label><input id="settings-owner" className="input" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} data-testid="input-settings-owner" /></div><div className="field"><label htmlFor="settings-email">E-mail</label><input id="settings-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-settings-email" /></div></div></section><section className="panel settings-section"><div className="panel-title">Planejamento mensal</div><div className="panel-sub">Um orçamento claro torna cada escolha mais leve.</div><div className="form-grid"><div className="field"><label htmlFor="settings-budget">Orçamento mensal</label><input id="settings-budget" className="input" type="number" min="1" step="0.01" value={form.monthlyBudget} onChange={(e) => setForm({ ...form, monthlyBudget: e.target.value })} data-testid="input-settings-budget" /><small>Usado para calcular seu limite na visão geral.</small></div></div></section><div className="form-footer">{saved && <span className="save-note" data-testid="status-settings-saved"><CheckCircle2 style={{ width: 14, verticalAlign: 'middle', marginRight: 5 }} />Alterações salvas</span>}<button className="btn btn-primary" disabled={update.isPending} data-testid="button-save-settings">{update.isPending ? <Loader2 className="animate-spin" /> : <Check />} Salvar alterações</button></div></form></Page>;
}

function SuccessToast({ message }: { message: string }) {
  return <div className="toast-success" data-testid="status-success"><CheckCircle2 />{message}</div>;
}

function Login() {
  const [, setLocation] = useLocation(); const [email, setEmail] = useState(''); const [error, setError] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); if (!email.includes('@')) { setError('Digite um e-mail válido para entrar.'); return; } setLocation('/dashboard'); };
  return <div className="login-page"><section className="login-art"><Brand /><div className="login-quote"><h1>Decisões mais tranquilas começam aqui.</h1><p>Uma visão simples e humana para cuidar do dinheiro que cuida de tanta gente.</p></div><div className="login-points"><span><CheckCircle2 /> Feito para clínicas pequenas</span><span><CheckCircle2 /> Dados sempre à mão</span></div></section><section className="login-form-side"><form className="login-form" onSubmit={submit}><div className="eyebrow">Bem-vinda de volta</div><h2>Entrar no ELO</h2><p>Acesse seu espaço financeiro. Para esta demonstração, basta informar seu e-mail.</p><div className="field"><label htmlFor="login-email">Seu e-mail</label><div style={{ position: 'relative' }}><Mail style={{ position: 'absolute', left: 11, top: 11, width: 15, color: 'hsl(var(--muted-foreground))' }} /><input id="login-email" className="input" style={{ paddingLeft: 34 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@clinicadomelhor.com.br" data-testid="input-login-email" /></div></div>{error && <div style={{ color: 'hsl(var(--destructive))', fontSize: 11 }} data-testid="status-login-error">{error}</div>}<button className="btn btn-primary" data-testid="button-login">Entrar no meu espaço <ChevronRight /></button><button type="button" className="btn btn-secondary" onClick={() => setLocation('/dashboard')} data-testid="button-demo-access">Acessar demonstração</button><div className="text-center mt-6" style={{ color: 'hsl(var(--muted-foreground))', fontSize: 10 }}>Ambiente seguro para sua rotina financeira.</div></form></section></div>;
}

function Router() {
  return <ErrorBoundary resetKey={window.location.pathname}><Switch><Route path="/" component={Login} /><Route path="/dashboard"><AppShell><Dashboard /></AppShell></Route><Route path="/expenses"><AppShell><Expenses /></AppShell></Route><Route path="/categories"><AppShell><Categories /></AppShell></Route><Route path="/reports"><AppShell><Reports /></AppShell></Route><Route path="/settings"><AppShell><Settings /></AppShell></Route><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;