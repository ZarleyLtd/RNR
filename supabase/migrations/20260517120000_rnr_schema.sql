-- RnR: holiday home bookings and activity log
-- Service role (Edge Functions) bypasses RLS; direct DB access from clients is denied.

create schema if not exists rnr;

create table rnr.bookings (
  id bigserial primary key,
  guest_name text not null default '',
  room text not null default '',
  start_date date not null,
  end_date date not null,
  notes text not null default '',
  pin text not null default '',
  created_at timestamptz not null default now()
);

create index bookings_start_date_idx on rnr.bookings (start_date);

create table rnr.activity_log (
  id bigserial primary key,
  ts timestamptz not null default now(),
  action text not null,
  booking_id bigint,
  data jsonb not null default '{}'::jsonb,
  session_info jsonb not null default '{}'::jsonb
);

create index activity_log_ts_idx on rnr.activity_log (ts desc);

alter table rnr.bookings enable row level security;
alter table rnr.activity_log enable row level security;

grant usage on schema rnr to anon, authenticated, service_role;
grant all on all tables in schema rnr to service_role;
grant all on all sequences in schema rnr to service_role;

alter default privileges for role postgres in schema rnr
grant all on tables to service_role;

alter default privileges for role postgres in schema rnr
grant all on sequences to service_role;
