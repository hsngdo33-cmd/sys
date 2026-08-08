-- Atomic customer/supplier invoice workflows.
-- Apply once in Supabase SQL Editor (or with the service-role migration runner).

create or replace function public.record_customer_sale(
  p_customer_id uuid,
  p_items jsonb,
  p_total numeric,
  p_profit numeric default 0,
  p_cash numeric default 0,
  p_description text default null,
  p_session_id uuid default null,
  p_created_by text default null
)
returns table (invoice_id uuid, customer_balance numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_factor numeric;
  v_stock_qty numeric;
  v_before numeric;
  v_after numeric;
  v_invoice_id uuid;
  v_balance numeric;
  v_items jsonb := '[]'::jsonb;
  v_cash numeric := greatest(coalesce(p_cash, 0), 0);
  v_total numeric := greatest(coalesce(p_total, 0), 0);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sale must contain at least one item';
  end if;
  if v_total <= 0 or v_cash > v_total then raise exception 'Invalid sale totals'; end if;

  select coalesce(balance, 0) into v_balance from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'id', '')::uuid;
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    v_factor := greatest(coalesce((v_item->>'unit_factor')::numeric, 1), 0.001);
    v_stock_qty := v_qty * v_factor;
    if v_product_id is null or v_stock_qty <= 0 then raise exception 'Invalid sale item'; end if;

    select coalesce(stock_quantity, 0) into v_before from public.products where id = v_product_id for update;
    if not found then raise exception 'Product not found'; end if;
    if v_before < v_stock_qty then raise exception 'Stock is not enough for product %', v_product_id; end if;

    v_items := v_items || jsonb_build_array(v_item || jsonb_build_object(
      'qty', v_qty, 'unit_factor', v_factor, 'stock_qty', v_stock_qty
    ));
  end loop;

  insert into public.customer_transactions(customer_id, amount, type, items, profit, description)
  values (p_customer_id, v_total, 'sale', v_items, coalesce(p_profit, 0), p_description)
  returning id into v_invoice_id;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_product_id := (v_item->>'id')::uuid;
    v_stock_qty := (v_item->>'stock_qty')::numeric;
    select coalesce(stock_quantity, 0) into v_before from public.products where id = v_product_id for update;
    v_after := v_before - v_stock_qty;
    update public.products set stock_quantity = v_after where id = v_product_id;
    insert into public.inventory_movements(product_id,movement_type,quantity,quantity_before,quantity_after,unit_cost,source_type,source_id,note,created_by)
    values (v_product_id,'sale',-v_stock_qty,v_before,v_after,coalesce((v_item->>'cost')::numeric,0),'customer_invoice',v_invoice_id::text,'فاتورة بيع',p_created_by);
  end loop;

  if v_cash > 0 then
    insert into public.customer_transactions(customer_id,amount,type,description)
    values (p_customer_id,v_cash,'payment','سداد من فاتورة بيع #' || v_invoice_id::text);
    insert into public.cash_entries(session_id,entry_type,direction,payment_method,amount,source_type,source_id,note,created_by)
    values (p_session_id,'sale_payment','in','cash',v_cash,'customer_invoice',v_invoice_id::text,'تحصيل من فاتورة بيع',p_created_by);
  end if;

  update public.customers set balance = coalesce(balance,0) + (v_total - v_cash)
  where id = p_customer_id returning balance into v_balance;
  return query select v_invoice_id, v_balance;
end;
$$;

create or replace function public.record_supplier_invoice(
  p_supplier_id uuid,
  p_items jsonb,
  p_total numeric,
  p_cash numeric default 0,
  p_description text default null,
  p_created_by text default null
)
returns table (invoice_id bigint, supplier_balance numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb; v_product_id uuid; v_qty numeric; v_factor numeric; v_stock_qty numeric;
  v_before numeric; v_after numeric; v_invoice_id bigint; v_balance numeric;
  v_items jsonb := '[]'::jsonb; v_cash numeric := greatest(coalesce(p_cash,0),0);
  v_total numeric := greatest(coalesce(p_total,0),0);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Invoice must contain items'; end if;
  if v_total <= 0 or v_cash > v_total then raise exception 'Invalid supplier invoice totals'; end if;
  select coalesce(balance,0) into v_balance from public.suppliers where id=p_supplier_id for update;
  if not found then raise exception 'Supplier not found'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'id','')::uuid;
    v_qty := coalesce((v_item->>'qty')::numeric,0);
    v_factor := greatest(coalesce((v_item->>'unit_factor')::numeric,1),0.001);
    v_stock_qty := v_qty*v_factor;
    if v_product_id is null or v_stock_qty <= 0 then raise exception 'Invalid supplier item'; end if;
    perform 1 from public.products where id=v_product_id for update;
    if not found then raise exception 'Product not found'; end if;
    v_items := v_items || jsonb_build_array(v_item || jsonb_build_object('qty',v_qty,'unit_factor',v_factor,'stock_qty',v_stock_qty));
  end loop;

  insert into public.transactions(supplier_id,amount,type,items,description)
  values(p_supplier_id,v_total,'فاتورة توريد',v_items,p_description) returning id into v_invoice_id;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_product_id := (v_item->>'id')::uuid; v_stock_qty := (v_item->>'stock_qty')::numeric;
    select coalesce(stock_quantity,0) into v_before from public.products where id=v_product_id for update;
    v_after := v_before+v_stock_qty;
    update public.products set stock_quantity=v_after,
      purchase_price=coalesce((v_item->>'base_purchase_price')::numeric,purchase_price),
      sale_price=coalesce((v_item->>'next_sale_price')::numeric,sale_price),
      product_attributes=coalesce(v_item->'product_attributes',product_attributes)
    where id=v_product_id;
    insert into public.inventory_movements(product_id,movement_type,quantity,quantity_before,quantity_after,unit_cost,source_type,source_id,note,created_by)
    values(v_product_id,'purchase',v_stock_qty,v_before,v_after,coalesce((v_item->>'base_purchase_price')::numeric,0),'supplier_invoice',v_invoice_id::text,'فاتورة توريد',p_created_by);
  end loop;

  if v_cash > 0 then
    insert into public.transactions(supplier_id,amount,type,description) values(p_supplier_id,v_cash,'سداد نقدي','دفعة من فاتورة #'||v_invoice_id::text);
  end if;
  update public.suppliers set balance=coalesce(balance,0)+(v_total-v_cash) where id=p_supplier_id returning balance into v_balance;
  return query select v_invoice_id,v_balance;
end;
$$;

create or replace function public.record_customer_return(
  p_customer_id uuid,
  p_items jsonb,
  p_total numeric,
  p_profit numeric default 0,
  p_description text default null,
  p_created_by text default null
)
returns table (return_id uuid, customer_balance numeric)
language plpgsql security definer set search_path=public as $$
declare
  v_item jsonb; v_product_id uuid; v_qty numeric; v_factor numeric; v_stock_qty numeric;
  v_before numeric; v_after numeric; v_return_id uuid; v_balance numeric; v_items jsonb:='[]'::jsonb;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Return must contain items'; end if;
  if coalesce(p_total,0)<=0 then raise exception 'Invalid return total'; end if;
  select coalesce(balance,0) into v_balance from public.customers where id=p_customer_id for update;
  if not found then raise exception 'Customer not found'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id:=nullif(v_item->>'id','')::uuid; v_qty:=coalesce((v_item->>'qty')::numeric,0);
    v_factor:=greatest(coalesce((v_item->>'unit_factor')::numeric,1),0.001); v_stock_qty:=v_qty*v_factor;
    if v_product_id is null or v_stock_qty<=0 then raise exception 'Invalid return item'; end if;
    perform 1 from public.products where id=v_product_id for update; if not found then raise exception 'Product not found'; end if;
    v_items:=v_items||jsonb_build_array(v_item||jsonb_build_object('qty',v_qty,'unit_factor',v_factor,'stock_qty',v_stock_qty));
  end loop;
  insert into public.customer_transactions(customer_id,amount,type,items,profit,description)
  values(p_customer_id,p_total,'return',v_items,coalesce(p_profit,0),p_description) returning id into v_return_id;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_product_id:=(v_item->>'id')::uuid; v_stock_qty:=(v_item->>'stock_qty')::numeric;
    select coalesce(stock_quantity,0) into v_before from public.products where id=v_product_id for update;
    v_after:=v_before+v_stock_qty; update public.products set stock_quantity=v_after where id=v_product_id;
    insert into public.inventory_movements(product_id,movement_type,quantity,quantity_before,quantity_after,unit_cost,source_type,source_id,note,created_by)
    values(v_product_id,'customer_return',v_stock_qty,v_before,v_after,coalesce((v_item->>'cost')::numeric,0),'customer_return',v_return_id::text,'مرتجع عميل',p_created_by);
  end loop;
  update public.customers set balance=coalesce(balance,0)-p_total where id=p_customer_id returning balance into v_balance;
  return query select v_return_id,v_balance;
end;
$$;

grant execute on function public.record_customer_sale(uuid,jsonb,numeric,numeric,numeric,text,uuid,text) to anon,authenticated;
grant execute on function public.record_supplier_invoice(uuid,jsonb,numeric,numeric,text,text) to anon,authenticated;
grant execute on function public.record_customer_return(uuid,jsonb,numeric,numeric,text,text) to anon,authenticated;

create or replace function public.update_customer_sale(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_total numeric,
  p_profit numeric,
  p_description text default null,
  p_created_by text default null
)
returns table (invoice_id uuid, customer_balance numeric)
language plpgsql security definer set search_path=public as $$
declare
  v_invoice public.customer_transactions%rowtype; v_item jsonb; v_product_id uuid;
  v_qty numeric; v_factor numeric; v_stock_qty numeric; v_before numeric; v_after numeric;
  v_items jsonb:='[]'::jsonb; v_balance numeric; v_difference numeric;
begin
  select * into v_invoice from public.customer_transactions
  where id=p_invoice_id and customer_id=p_customer_id and type in ('sale','بيع') for update;
  if not found then raise exception 'Customer sale not found'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Sale must contain items'; end if;
  select coalesce(balance,0) into v_balance from public.customers where id=p_customer_id for update;

  -- Restore the exact base-unit quantity stored by the old invoice.
  for v_item in select value from jsonb_array_elements(coalesce(v_invoice.items,'[]'::jsonb)) loop
    v_product_id:=nullif(v_item->>'id','')::uuid;
    v_stock_qty:=coalesce((v_item->>'stock_qty')::numeric,
      coalesce((v_item->>'qty')::numeric,0)*greatest(coalesce((v_item->>'unit_factor')::numeric,1),0.001));
    select coalesce(stock_quantity,0) into v_before from public.products where id=v_product_id for update;
    if not found then raise exception 'Old product not found'; end if;
    v_after:=v_before+v_stock_qty; update public.products set stock_quantity=v_after where id=v_product_id;
    insert into public.inventory_movements(product_id,movement_type,quantity,quantity_before,quantity_after,unit_cost,source_type,source_id,note,created_by)
    values(v_product_id,'invoice_edit_restore',v_stock_qty,v_before,v_after,coalesce((v_item->>'cost')::numeric,0),'customer_invoice_edit',p_invoice_id::text,'إرجاع كمية الفاتورة قبل التعديل',p_created_by);
  end loop;

  -- Validate and deduct the edited quantities.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id:=nullif(v_item->>'id','')::uuid; v_qty:=coalesce((v_item->>'qty')::numeric,0);
    v_factor:=greatest(coalesce((v_item->>'unit_factor')::numeric,1),0.001); v_stock_qty:=v_qty*v_factor;
    if v_product_id is null or v_stock_qty<=0 then raise exception 'Invalid edited sale item'; end if;
    select coalesce(stock_quantity,0) into v_before from public.products where id=v_product_id for update;
    if not found then raise exception 'Product not found'; end if;
    if v_before<v_stock_qty then raise exception 'Stock is not enough'; end if;
    v_after:=v_before-v_stock_qty; update public.products set stock_quantity=v_after where id=v_product_id;
    insert into public.inventory_movements(product_id,movement_type,quantity,quantity_before,quantity_after,unit_cost,source_type,source_id,note,created_by)
    values(v_product_id,'invoice_edit_sale',-v_stock_qty,v_before,v_after,coalesce((v_item->>'cost')::numeric,0),'customer_invoice_edit',p_invoice_id::text,'خصم كمية الفاتورة بعد التعديل',p_created_by);
    v_items:=v_items||jsonb_build_array(v_item||jsonb_build_object('qty',v_qty,'unit_factor',v_factor,'stock_qty',v_stock_qty));
  end loop;

  v_difference:=coalesce(p_total,0)-coalesce(v_invoice.amount,0);
  update public.customer_transactions set amount=p_total,items=v_items,profit=coalesce(p_profit,0),description=p_description where id=p_invoice_id;
  update public.customers set balance=coalesce(balance,0)+v_difference where id=p_customer_id returning balance into v_balance;
  return query select p_invoice_id,v_balance;
end;
$$;

grant execute on function public.update_customer_sale(uuid,uuid,jsonb,numeric,numeric,text,text) to anon,authenticated;
