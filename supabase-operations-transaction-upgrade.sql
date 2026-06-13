-- Atomic inventory adjustment for the Operations page.
-- Run this file in Supabase SQL Editor when you want DB-level protection:
-- product stock update and inventory movement insert succeed or fail together.

create or replace function public.record_inventory_adjustment(
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_note text default null,
  p_created_by text default null
)
returns table (
  product_id uuid,
  quantity_before numeric,
  quantity_after numeric,
  movement_id uuid
)
language plpgsql
security definer
as $$
declare
  v_before numeric;
  v_after numeric;
  v_movement_id uuid;
begin
  select stock_quantity
    into v_before
    from public.products
   where id = p_product_id
   for update;

  if v_before is null then
    raise exception 'Product not found';
  end if;

  v_after := v_before + p_quantity;

  if v_after < 0 then
    raise exception 'Stock cannot be negative';
  end if;

  update public.products
     set stock_quantity = v_after
   where id = p_product_id;

  insert into public.inventory_movements (
    product_id,
    movement_type,
    quantity,
    quantity_before,
    quantity_after,
    source_type,
    note,
    created_by
  )
  values (
    p_product_id,
    p_movement_type,
    p_quantity,
    v_before,
    v_after,
    'manual_adjustment',
    p_note,
    p_created_by
  )
  returning id into v_movement_id;

  return query select p_product_id, v_before, v_after, v_movement_id;
end;
$$;
