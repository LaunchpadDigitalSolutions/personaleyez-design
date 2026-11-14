-- 2026-11-14: Job 4 — news section.
-- Creates ps_news table with public-read RLS (published rows only) and
-- admin functions for listing, creating, updating and deleting posts.
-- Additive only. Undo: supabase/2026-11-14-news-undo.sql.

create table if not exists ps_news (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title        text not null,
  body         text,
  excerpt      text,
  photo_url    text,
  external_url text,
  tag          text not null default 'News' check (tag in ('News', 'Press')),
  published    boolean not null default false,
  published_at timestamptz default now(),
  created_at   timestamptz default now()
);

alter table ps_news enable row level security;

-- Public can read published posts only
create policy "ps_news public read"
  on ps_news for select using (published = true);

-- Admin list: all posts including drafts
create or replace function ps_admin_list_news(p_pass text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  perform ps_admin_check(p_pass);
  return coalesce((
    select jsonb_agg(to_jsonb(n) order by n.published_at desc, n.created_at desc)
    from ps_news n
  ), '[]'::jsonb);
end; $$;

-- Admin create
create or replace function ps_admin_create_news(
  p_pass        text,
  p_slug        text,
  p_title       text,
  p_body        text,
  p_excerpt     text,
  p_photo_url   text,
  p_external_url text,
  p_tag         text,
  p_published   boolean,
  p_published_at timestamptz
)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  perform ps_admin_check(p_pass);
  if nullif(trim(p_slug), '') is null then raise exception 'PS-N01: slug required'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'PS-N02: title required'; end if;
  insert into ps_news(slug, title, body, excerpt, photo_url, external_url, tag, published, published_at)
  values (
    lower(trim(p_slug)), trim(p_title),
    nullif(trim(coalesce(p_body, '')), ''),
    nullif(trim(coalesce(p_excerpt, '')), ''),
    nullif(trim(coalesce(p_photo_url, '')), ''),
    nullif(trim(coalesce(p_external_url, '')), ''),
    coalesce(nullif(trim(p_tag), ''), 'News'),
    coalesce(p_published, false),
    coalesce(p_published_at, now())
  ) returning id into v_id;
  return jsonb_build_object('id', v_id);
end; $$;

-- Admin update
create or replace function ps_admin_update_news(
  p_pass        text,
  p_id          uuid,
  p_title       text,
  p_body        text,
  p_excerpt     text,
  p_photo_url   text,
  p_external_url text,
  p_tag         text,
  p_published   boolean,
  p_published_at timestamptz
)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  perform ps_admin_check(p_pass);
  update ps_news set
    title = coalesce(nullif(trim(p_title), ''), title),
    body = nullif(trim(coalesce(p_body, '')), ''),
    excerpt = nullif(trim(coalesce(p_excerpt, '')), ''),
    photo_url = nullif(trim(coalesce(p_photo_url, '')), ''),
    external_url = nullif(trim(coalesce(p_external_url, '')), ''),
    tag = coalesce(nullif(trim(p_tag), ''), tag),
    published = coalesce(p_published, published),
    published_at = coalesce(p_published_at, published_at)
  where id = p_id;
  if not found then raise exception 'PS-N03: post not found'; end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Admin delete
create or replace function ps_admin_delete_news(p_pass text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  perform ps_admin_check(p_pass);
  delete from ps_news where id = p_id;
  if not found then raise exception 'PS-N04: post not found'; end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Revoke direct access; all writes via admin functions only
revoke all on ps_news from public, anon, authenticated;
grant select on ps_news to anon, authenticated;  -- RLS enforces published=true for public
