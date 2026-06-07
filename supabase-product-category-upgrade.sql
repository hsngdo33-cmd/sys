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

create index if not exists products_product_category_idx
on public.products(product_category);
