-- Run once in a fresh Supabase project. Service-role RPCs are never browser-callable.
create extension if not exists pgcrypto;
create table public.restaurants (id uuid primary key, name text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.branches (id uuid primary key, restaurant_id uuid not null references public.restaurants, name text not null, settings jsonb not null default '{"open":8,"close":22,"interval":15,"capacity":15,"basePrep":15}', next_number integer not null default 1000, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,restaurant_id));
create table public.users (id uuid primary key references auth.users on delete cascade, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.staff_roles (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, restaurant_id uuid not null references public.restaurants, branch_id uuid not null, role text not null check(role in ('OWNER','MANAGER','CASHIER','KITCHEN')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), foreign key(branch_id,restaurant_id) references public.branches(id,restaurant_id), unique(user_id,branch_id));
create table public.branch_revisions (branch_id uuid primary key references public.branches, restaurant_id uuid not null references public.restaurants, revision bigint not null default 0);
create function public.is_branch_staff(b uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from staff_roles where user_id=auth.uid() and branch_id=b); $$;

-- Document-backed entities keep relational tenant/identity keys and transactional projections.
do $$ declare t text; begin
  foreach t in array array['customers','categories','products','product_variants','option_groups','product_options','orders','order_items','order_item_options','payments','pickup_slots','inventory_items','product_ingredients','stock_movements','waste_records','notifications','audit_logs'] loop
    execute format('create table public.%I (id uuid primary key, restaurant_id uuid not null references public.restaurants, branch_id uuid not null, data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), foreign key(branch_id,restaurant_id) references public.branches(id,restaurant_id))',t);
    execute format('alter table public.%I enable row level security',t);
    execute format('create index on public.%I(branch_id)',t);
    -- Browser clients have no direct customer/order reads. Authorized server endpoints filter by role.
  end loop;
end $$;
alter table public.orders add column order_number integer generated always as ((data->>'number')::integer) stored;
alter table public.orders add column reference text generated always as (data->>'reference') stored;
alter table public.orders add column request_id uuid generated always as ((data->>'requestId')::uuid) stored;
alter table public.orders add unique(branch_id,order_number);
alter table public.orders add unique(reference);
alter table public.orders add unique(branch_id,request_id);
alter table public.payments add column reference text generated always as (data->>'reference') stored unique;
alter table public.order_items add column order_id uuid references public.orders on delete cascade;
alter table public.order_item_options add column order_item_id uuid references public.order_items on delete cascade;
alter table public.product_ingredients add column product_id uuid references public.products on delete cascade;
alter table public.product_ingredients add column inventory_id uuid references public.inventory_items;
alter table public.customers add column phone text generated always as (data->>'phone') stored;
alter table public.customers add unique(branch_id,phone);
alter table public.restaurants enable row level security;
alter table public.branches enable row level security;
alter table public.users enable row level security;
alter table public.staff_roles enable row level security;
alter table public.branch_revisions enable row level security;
create policy own_membership on public.staff_roles for select to authenticated using (user_id=auth.uid());
create policy revision_signal on public.branch_revisions for select to authenticated using (public.is_branch_staff(branch_id));
alter publication supabase_realtime add table public.branch_revisions;

create function public.read_branch(p_branch uuid,p_restaurant uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; pair text[]; records jsonb;
begin
 select jsonb_build_object('revision',r.revision,'nextNumber',b.next_number,'settings',b.settings) into result from branches b join branch_revisions r on r.branch_id=b.id where b.id=p_branch and b.restaurant_id=p_restaurant;
 if result is null then raise exception 'Branch not initialized'; end if;
 foreach pair slice 1 in array array[['products','products'],['orders','orders'],['customers','customers'],['inventory_items','inventory'],['stock_movements','movements'],['notifications','notifications'],['audit_logs','audits']] loop
   execute format('select coalesce(jsonb_agg(data),''[]''::jsonb) from public.%I where branch_id=$1 and restaurant_id=$2',pair[1]) into records using p_branch,p_restaurant;
   result := result || jsonb_build_object(pair[2],records);
 end loop;
 return result;
end $$;
create function public.commit_branch(p_branch uuid,p_restaurant uuid,p_revision bigint,p_state jsonb) returns boolean language plpgsql security definer set search_path=public as $$
declare current_revision bigint; pair text[]; record jsonb; item jsonb; opt jsonb; item_id uuid; ingredient record;
begin
 select revision into current_revision from branch_revisions where branch_id=p_branch and restaurant_id=p_restaurant for update;
 if current_revision is null then raise exception 'Unknown branch'; end if;
 if current_revision<>p_revision then return false; end if;
 foreach pair slice 1 in array array[['products','products'],['orders','orders'],['customers','customers'],['inventory_items','inventory'],['stock_movements','movements'],['notifications','notifications'],['audit_logs','audits']] loop
   for record in select value from jsonb_array_elements(p_state->pair[2]) loop
     execute format('insert into public.%I(id,restaurant_id,branch_id,data) values($1,$2,$3,$4) on conflict(id) do update set data=excluded.data,updated_at=now() where %I.branch_id=excluded.branch_id and %I.restaurant_id=excluded.restaurant_id',pair[1],pair[1],pair[1]) using (record->>'id')::uuid,p_restaurant,p_branch,record;
   end loop;
 end loop;
 -- Materialized reporting tables; all writes share the same revision transaction.
 delete from order_items where branch_id=p_branch;
 delete from payments where branch_id=p_branch;
 delete from product_ingredients where branch_id=p_branch;
 delete from waste_records where branch_id=p_branch;
 for record in select value from jsonb_array_elements(p_state->'orders') loop
   for item in select value from jsonb_array_elements(record->'items') loop
     item_id:=gen_random_uuid();
     insert into order_items(id,restaurant_id,branch_id,data,order_id) values(item_id,p_restaurant,p_branch,item,(record->>'id')::uuid);
     for opt in select value from jsonb_array_elements(item->'options') loop insert into order_item_options(id,restaurant_id,branch_id,data,order_item_id) values(gen_random_uuid(),p_restaurant,p_branch,opt,item_id); end loop;
   end loop;
   insert into payments(id,restaurant_id,branch_id,data) values((record->>'id')::uuid,p_restaurant,p_branch,jsonb_build_object('reference',record->>'reference','status',record->>'paymentStatus','amount',record->'total','currency','GHS'));
 end loop;
 for record in select value from jsonb_array_elements(p_state->'products') loop
   for ingredient in select * from jsonb_each(record->'ingredients') loop insert into product_ingredients(id,restaurant_id,branch_id,data,product_id,inventory_id) values(gen_random_uuid(),p_restaurant,p_branch,jsonb_build_object('quantity',ingredient.value),(record->>'id')::uuid,ingredient.key::uuid); end loop;
 end loop;
 for record in select value from jsonb_array_elements(p_state->'movements') where value->>'kind'='WASTE' loop insert into waste_records(id,restaurant_id,branch_id,data) values((record->>'id')::uuid,p_restaurant,p_branch,record); end loop;
 update branches set settings=p_state->'settings',next_number=(p_state->>'nextNumber')::integer,updated_at=now() where id=p_branch;
 update branch_revisions set revision=revision+1 where branch_id=p_branch;
 return true;
end $$;
create table public.rate_limits (key text primary key, window_start timestamptz not null, count integer not null);
alter table public.rate_limits enable row level security;
create function public.take_rate_limit(p_key text,p_limit integer) returns boolean language plpgsql security definer set search_path=public as $$ declare n integer; begin
 insert into rate_limits values(p_key,now(),1) on conflict(key) do update set count=case when rate_limits.window_start<now()-interval '1 minute' then 1 else rate_limits.count+1 end,window_start=case when rate_limits.window_start<now()-interval '1 minute' then now() else rate_limits.window_start end returning count into n;
 delete from rate_limits where window_start<now()-interval '1 day'; return n<=p_limit; end $$;
revoke execute on function public.read_branch(uuid,uuid),public.commit_branch(uuid,uuid,bigint,jsonb),public.take_rate_limit(text,integer) from public,anon,authenticated;
grant execute on function public.read_branch(uuid,uuid),public.commit_branch(uuid,uuid,bigint,jsonb),public.take_rate_limit(text,integer) to service_role;
insert into public.restaurants(id,name) values('00000000-0000-4000-8000-000000000001','Chics & Chips');
insert into public.branches(id,restaurant_id,name) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Pent Hall');
insert into public.branch_revisions(branch_id,restaurant_id) select id,restaurant_id from public.branches;
