alter table public.products
  add column if not exists reorder_point numeric default 5,
  add column if not exists reorder_target numeric default 10;

update public.products
set
  reorder_point = coalesce(reorder_point, 5),
  reorder_target = greatest(coalesce(reorder_target, 10), coalesce(reorder_point, 5));

notify pgrst, 'reload schema';
