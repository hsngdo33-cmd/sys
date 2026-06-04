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
  created_at timestamptz default now(),
  supplier_id uuid,
  barcode text,
  product_category text not null default 'stationery',
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

create index if not exists customer_transactions_customer_id_idx on public.customer_transactions(customer_id);
create index if not exists customer_transactions_created_at_idx on public.customer_transactions(created_at);
create index if not exists transactions_supplier_id_idx on public.transactions(supplier_id);
create index if not exists transactions_customer_id_idx on public.transactions(customer_id);
create index if not exists transactions_created_at_idx on public.transactions(created_at);
create index if not exists products_supplier_id_idx on public.products(supplier_id);

alter table public.products
  add column if not exists product_category text not null default 'stationery';

alter table public.products
  drop constraint if exists products_product_category_check;

alter table public.products
  add constraint products_product_category_check
  check (product_category in ('books', 'stationery'));

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
