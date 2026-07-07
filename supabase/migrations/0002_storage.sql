-- =====================================================================
-- Storage：文章圖片 bucket
--   bucket 名稱：article-images
--   公開讀取（public read）；只有 admin 白名單可上傳 / 覆蓋 / 刪除
-- 套用方式：Supabase Dashboard → SQL Editor 執行本檔（在 0001 之後）
-- 前端上傳時另外做「壓縮 + 大小/類型限制」（見 assets/js/admin.js）
-- =====================================================================

-- 建立 public bucket；限制單檔 5MB、僅允許常見圖片類型
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'article-images',
  'article-images',
  true,
  5242880,  -- 5 MB
  array['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Storage RLS policies（作用於 storage.objects）
-- ---------------------------------------------------------------------

-- 公開讀取此 bucket 的檔案
drop policy if exists article_images_public_read on storage.objects;
create policy article_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'article-images');

-- 只有 admin 可上傳
drop policy if exists article_images_admin_insert on storage.objects;
create policy article_images_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'article-images' and public.is_admin());

-- 只有 admin 可更新（覆蓋）
drop policy if exists article_images_admin_update on storage.objects;
create policy article_images_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'article-images' and public.is_admin())
  with check (bucket_id = 'article-images' and public.is_admin());

-- 只有 admin 可刪除
drop policy if exists article_images_admin_delete on storage.objects;
create policy article_images_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'article-images' and public.is_admin());
