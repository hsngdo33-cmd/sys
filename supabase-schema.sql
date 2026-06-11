create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create table if not exists public.customers (
  id uuid not null default uuid_generate_v4(),
  name text not null,
  phone text,
  balance numeric default 0,
  created_at timestamptz default now(),
  constraint customers_pkey primary key (id)
);

create table if not exists public.suppliers (
  id uuid not null default gen_random_uuid(),
  name text not null,
  phone text,
  balance numeric default 0,
  created_at timestamptz default now(),
  constraint suppliers_pkey primary key (id)
);

create table if not exists public.products (
  id uuid not null default gen_random_uuid(),
  name text not null,
  unit text,
  purchase_price numeric default 0,
  sale_price numeric default 0,
  stock_quantity numeric default 0,
  reorder_point numeric default 5,
  reorder_target numeric default 10,
  created_at timestamptz default now(),
  supplier_id uuid,
  barcode text,
  product_category text not null default 'general',
  product_attributes jsonb not null default '{}'::jsonb,
  constraint products_pkey primary key (id),
  constraint products_barcode_key unique (barcode),
  constraint products_supplier_id_fkey foreign key (supplier_id) references public.suppliers(id)
);

create table if not exists public.customer_transactions (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_id uuid,
  amount numeric not null default 0,
  type text not null,
  description text,
  items jsonb default '[]'::jsonb,
  profit numeric default 0,
  constraint customer_transactions_pkey primary key (id),
  constraint customer_transactions_customer_id_fkey foreign key (customer_id) references public.customers(id)
);

create table if not exists public.transactions (
  id bigint generated always as identity not null,
  customer_id uuid,
  supplier_id uuid,
  type text,
  amount numeric not null,
  description text,
  items jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  constraint transactions_pkey primary key (id),
  constraint transactions_customer_id_fkey foreign key (customer_id) references public.customers(id),
  constraint transactions_supplier_id_fkey foreign key (supplier_id) references public.suppliers(id)
);

create table if not exists public.expenses (
  id uuid not null default gen_random_uuid(),
  category text,
  amount numeric not null,
  description text,
  expense_date date default current_date,
  constraint expenses_pkey primary key (id)
);

create table if not exists public.report_settings (
  id text not null,
  telegram_chat_id text,
  daily_enabled boolean not null default false,
  link_code text,
  updated_at timestamptz not null default now(),
  constraint report_settings_pkey primary key (id)
);

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
  category_settings jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint business_settings_pkey primary key (id)
);

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
  pin_code text,
  last_login_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint staff_members_pkey primary key (id)
);

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

create index if not exists customer_transactions_customer_id_idx on public.customer_transactions(customer_id);
create index if not exists customer_transactions_created_at_idx on public.customer_transactions(created_at);
create index if not exists transactions_supplier_id_idx on public.transactions(supplier_id);
create index if not exists transactions_customer_id_idx on public.transactions(customer_id);
create index if not exists transactions_created_at_idx on public.transactions(created_at);
create index if not exists products_supplier_id_idx on public.products(supplier_id);
create index if not exists inventory_movements_product_id_idx on public.inventory_movements(product_id);
create index if not exists inventory_movements_created_at_idx on public.inventory_movements(created_at);
create index if not exists inventory_movements_source_idx on public.inventory_movements(source_type, source_id);
create index if not exists cash_entries_created_at_idx on public.cash_entries(created_at);
create index if not exists cash_entries_session_id_idx on public.cash_entries(session_id);
create index if not exists cash_sessions_status_idx on public.cash_sessions(status);
create index if not exists staff_activity_logs_created_at_idx on public.staff_activity_logs(created_at);
create index if not exists staff_activity_logs_staff_id_idx on public.staff_activity_logs(staff_id);

alter table public.products
  add column if not exists product_category text not null default 'general';

alter table public.products
  drop constraint if exists products_product_category_check;

alter table public.products
  alter column product_category set default 'general';

update public.products
set product_category = 'general'
where product_category is null or trim(product_category) = '';

alter table public.products
  add column if not exists product_attributes jsonb not null default '{}'::jsonb;

create index if not exists products_product_category_idx on public.products(product_category);

create or replace function public.increment_stock(row_id uuid, amount numeric)
returns void
language plpgsql
as $$
begin
  update public.products
  set stock_quantity = coalesce(stock_quantity, 0) + coalesce(amount, 0)
  where id = row_id;
end;
$$;

create or replace function public.decrement_stock(row_id uuid, amount numeric)
returns void
language plpgsql
as $$
begin
  update public.products
  set stock_quantity = coalesce(stock_quantity, 0) - coalesce(amount, 0)
  where id = row_id;
end;
$$;
