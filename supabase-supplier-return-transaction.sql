-- Atomic supplier return workflow.
-- Run this file once in the Supabase SQL Editor before using supplier returns.
-- The transaction, stock changes, inventory movements, and supplier balance
-- either all succeed together or all roll back together.

create or replace function public.record_supplier_return(
  p_supplier_id uuid,
  p_items jsonb,
  p_discount_percent numeric default 0,
  p_description text default null,
  p_created_by text default null
)
returns table (
  transaction_id bigint,
  subtotal numeric,
  discount_amount numeric,
  total numeric,
  supplier_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_source_item jsonb;
  v_return_items jsonb := '[]'::jsonb;
  v_seen_keys text[] := array[]::text[];
  v_key text;
  v_product_id uuid;
  v_source_invoice_id bigint;
  v_qty numeric;
  v_purchased_qty numeric;
  v_previously_returned_qty numeric;
  v_unit_factor numeric;
  v_unit_price numeric;
  v_stock_return_qty numeric;
  v_stock_before numeric;
  v_stock_after numeric;
  v_subtotal numeric := 0;
  v_discount_rate numeric;
  v_discount_amount numeric;
  v_total numeric;
  v_transaction_id bigint;
  v_supplier_balance numeric;
begin
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Return must contain at least one item';
  end if;

  select coalesce(balance, 0)
    into v_supplier_balance
    from public.suppliers
   where id = p_supplier_id
   for update;

  if not found then
    raise exception 'Supplier not found';
  end if;

  v_discount_rate := greatest(least(coalesce(p_discount_percent, 0), 100), 0);

  -- Validate every line against its original invoice and build trusted items.
  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_product_id := nullif(v_item->>'id', '')::uuid;
    v_source_invoice_id := nullif(v_item->>'source_invoice_id', '')::bigint;
    v_qty := coalesce((v_item->>'qty')::numeric, 0);

    if v_product_id is null or v_source_invoice_id is null or v_qty <= 0 then
      raise exception 'Invalid supplier return item';
    end if;

    v_key := v_source_invoice_id::text || ':' || v_product_id::text;
    if v_key = any(v_seen_keys) then
      raise exception 'Duplicate supplier return item';
    end if;
    v_seen_keys := array_append(v_seen_keys, v_key);

    select invoice_item.value
      into v_source_item
      from public.transactions invoice
      cross join lateral jsonb_array_elements(coalesce(invoice.items, '[]'::jsonb)) invoice_item(value)
     where invoice.id = v_source_invoice_id
       and invoice.supplier_id = p_supplier_id
       and (
         invoice.type = 'فاتورة توريد'
         or (invoice.type like '%فاتورة%' and invoice.type like '%توريد%')
       )
       and invoice_item.value->>'id' = v_product_id::text
     limit 1;

    if v_source_item is null then
      raise exception 'Original supplier invoice item not found';
    end if;

    v_purchased_qty := coalesce((v_source_item->>'qty')::numeric, 0);

    select coalesce(sum((returned_item.value->>'qty')::numeric), 0)
      into v_previously_returned_qty
      from public.transactions supplier_return
      cross join lateral jsonb_array_elements(coalesce(supplier_return.items, '[]'::jsonb)) returned_item(value)
     where supplier_return.supplier_id = p_supplier_id
       and (
         supplier_return.type = 'supplier_return'
         or supplier_return.type = 'مرتجع مورد'
         or supplier_return.type like '%مرتجع مورد%'
       )
       and returned_item.value->>'source_invoice_id' = v_source_invoice_id::text
       and returned_item.value->>'id' = v_product_id::text;

    if v_qty > greatest(v_purchased_qty - v_previously_returned_qty, 0) then
      raise exception 'Return quantity exceeds the remaining invoice quantity';
    end if;

    v_unit_factor := greatest(coalesce((v_source_item->>'unit_factor')::numeric, 1), 0.001);
    v_unit_price := coalesce(
      (v_source_item->>'net_price')::numeric,
      (v_source_item->>'price')::numeric,
      0
    );
    v_stock_return_qty := v_qty * v_unit_factor;
    v_subtotal := v_subtotal + (v_qty * v_unit_price);

    v_return_items := v_return_items || jsonb_build_array(
      jsonb_build_object(
        'id', v_product_id,
        'name', coalesce(v_source_item->>'name', 'صنف بدون اسم'),
        'unit', coalesce(v_source_item->>'unit', ''),
        'invoice_unit', coalesce(v_source_item->>'invoice_unit', v_source_item->>'unit', ''),
        'unit_factor', v_unit_factor,
        'qty', v_qty,
        'stock_qty', v_stock_return_qty,
        'price', v_unit_price,
        'product_category', coalesce(v_source_item->>'product_category', 'general'),
        'source_invoice_id', v_source_invoice_id
      )
    );

    v_source_item := null;
  end loop;

  v_discount_amount := round(v_subtotal * (v_discount_rate / 100), 2);
  v_total := greatest(round(v_subtotal - v_discount_amount, 2), 0);

  if v_total <= 0 then
    raise exception 'Supplier return total must be greater than zero';
  end if;

  insert into public.transactions (
    supplier_id,
    amount,
    type,
    description,
    items
  )
  values (
    p_supplier_id,
    v_total,
    'supplier_return',
    coalesce(nullif(trim(p_description), ''), 'فاتورة مرتجع مورد'),
    v_return_items
  )
  returning id into v_transaction_id;

  -- Lock and update each product in order. Any error rolls back everything.
  for v_item in
    select value from jsonb_array_elements(v_return_items)
  loop
    v_product_id := (v_item->>'id')::uuid;
    v_stock_return_qty := (v_item->>'stock_qty')::numeric;
    v_unit_factor := greatest((v_item->>'unit_factor')::numeric, 0.001);
    v_unit_price := (v_item->>'price')::numeric;

    select coalesce(stock_quantity, 0)
      into v_stock_before
      from public.products
     where id = v_product_id
     for update;

    if not found then
      raise exception 'Product not found';
    end if;

    if v_stock_before < v_stock_return_qty then
      raise exception 'Stock is not enough for supplier return';
    end if;

    v_stock_after := v_stock_before - v_stock_return_qty;

    update public.products
       set stock_quantity = v_stock_after
     where id = v_product_id;

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      quantity_before,
      quantity_after,
      unit_cost,
      source_type,
      source_id,
      note,
      created_by
    )
    values (
      v_product_id,
      'supplier_return',
      -v_stock_return_qty,
      v_stock_before,
      v_stock_after,
      v_unit_price / v_unit_factor,
      'supplier_return',
      v_transaction_id::text,
      'مرتجع مورد',
      p_created_by
    );
  end loop;

  update public.suppliers
     set balance = coalesce(balance, 0) - v_total
   where id = p_supplier_id
  returning balance into v_supplier_balance;

  return query
  select
    v_transaction_id,
    v_subtotal,
    v_discount_amount,
    v_total,
    v_supplier_balance;
end;
$$;

grant execute on function public.record_supplier_return(uuid, jsonb, numeric, text, text)
  to anon, authenticated;
