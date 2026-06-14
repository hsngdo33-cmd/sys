update public.business_settings
set
  category_settings = (
    select jsonb_agg(
      case
        when category->>'key' = 'general' then category || '{"active": true}'::jsonb
        else category || '{"active": false}'::jsonb
      end
      order by category_order
    )
    from jsonb_array_elements(category_settings) with ordinality as categories(category, category_order)
  ),
  updated_at = now()
where id = 'main'
  and jsonb_typeof(category_settings) = 'array'
  and jsonb_array_length(category_settings) > 0;
