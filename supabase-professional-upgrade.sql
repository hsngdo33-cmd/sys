create table if not exists public.business_settings (
  id text not null default 'main',
  business_name text not null default 'محل تجاري',
  activity_type text not null default 'general',
  currency text not null default 'EGP',
  invoice_paper_size text not null default 'thermal_80',
  tax_mode text not null default 'none',
  allow_negative_stock boolean not null default false,
  require_shift_close boolean not null default true,
  default_payment_method text not null default 'cash',
  updated_at timestamptz not null default now(),
  constraint business_settings_pkey primary key (id)
);

alter table public.business_settings
  add column if not exists business_name text not null default 'محل تجاري',
  add column if not exists activity_type text not null default 'general',
  add column if not exists currency text not null default 'EGP',
  add column if not exists invoice_paper_size text not null default 'thermal_80',
  add column if not exists tax_mode text not null default 'none',
  add column if not exists allow_negative_stock boolean not null default false,
  add column if not exists require_shift_close boolean not null default true,
  add column if not exists default_payment_method text not null default 'cash',
  add column if not exists category_settings jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.branches (
  id uuid not null default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint branches_pkey primary key (id)
);

create table if not exists public.warehouses (
  id uuid not null default gen_random_uuid(),
  branch_id uuid,
  name text not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint warehouses_pkey primary key (id),
  constraint warehouses_branch_id_fkey foreign key (branch_id) references public.branches(id)
);

create table if not exists public.staff_members (
  id uuid not null default gen_random_uuid(),
  name text not null,
  role text not null default 'cashier',
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint staff_members_pkey primary key (id)
);

alter table public.staff_members
  add column if not exists pin_code text,
  add column if not exists last_login_at timestamptz;

create table if not exists public.inventory_movements (
  id uuid not null default gen_random_uuid(),
  product_id uuid,
  movement_type text not null,
  quantity numeric not null,
  quantity_before numeric,
  quantity_after numeric,
  unit_cost numeric default 0,
  source_type text,
  source_id text,
  warehouse_id uuid,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint inventory_movements_pkey primary key (id),
  constraint inventory_movements_product_id_fkey foreign key (product_id) references public.products(id),
  constraint inventory_movements_warehouse_id_fkey foreign key (warehouse_id) references public.warehouses(id)
);

create table if not exists public.cash_sessions (
  id uuid not null default gen_random_uuid(),
  opened_by text,
  closed_by text,
  opening_balance numeric not null default 0,
  closing_balance numeric,
  expected_balance numeric,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  note text,
  constraint cash_sessions_pkey primary key (id)
);

create table if not exists public.cash_entries (
  id uuid not null default gen_random_uuid(),
  session_id uuid,
  entry_type text not null,
  direction text not null,
  payment_method text not null default 'cash',
  amount numeric not null,
  source_type text,
  source_id text,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint cash_entries_pkey primary key (id),
  constraint cash_entries_session_id_fkey foreign key (session_id) references public.cash_sessions(id)
);

create table if not exists public.staff_activity_logs (
  id uuid not null default gen_random_uuid(),
  staff_id uuid,
  staff_name text,
  staff_role text,
  action text not null,
  entity_type text,
  entity_id text,
  note text,
  created_at timestamptz not null default now(),
  constraint staff_activity_logs_pkey primary key (id),
  constraint staff_activity_logs_staff_id_fkey foreign key (staff_id) references public.staff_members(id)
);

insert into public.business_settings (id)
values ('main')
on conflict (id) do nothing;

create index if not exists inventory_movements_product_id_idx on public.inventory_movements(product_id);
create index if not exists inventory_movements_created_at_idx on public.inventory_movements(created_at);
create index if not exists inventory_movements_source_idx on public.inventory_movements(source_type, source_id);
create index if not exists cash_entries_created_at_idx on public.cash_entries(created_at);
create index if not exists cash_entries_session_id_idx on public.cash_entries(session_id);
create index if not exists cash_sessions_status_idx on public.cash_sessions(status);
create index if not exists staff_activity_logs_created_at_idx on public.staff_activity_logs(created_at);
create index if not exists staff_activity_logs_staff_id_idx on public.staff_activity_logs(staff_id);
