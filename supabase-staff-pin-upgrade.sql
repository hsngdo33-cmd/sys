alter table public.staff_members
  add column if not exists pin_code text,
  add column if not exists last_login_at timestamptz;

notify pgrst, 'reload schema';
