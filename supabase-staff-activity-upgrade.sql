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

create index if not exists staff_activity_logs_created_at_idx on public.staff_activity_logs(created_at);
create index if not exists staff_activity_logs_staff_id_idx on public.staff_activity_logs(staff_id);

notify pgrst, 'reload schema';
