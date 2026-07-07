/**
 * supabase-config.js
 *
 * 主網站專屬 Supabase 設定。
 *  - 這裡只放「新專案」的 Project URL 與 anon(public) key（公開只讀，可進 repo）。
 *  - 絕對不要把 service_role key 放進這個檔案或任何前端檔案！
 *  - 取得位置：Supabase Dashboard → Project Settings → API。
 */
window.SUPABASE_CONFIG = {
  url: "https://ypyiqysgfwgxcmmsylob.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlweWlxeXNnZndneGNtbXN5bG9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NTIwMTEsImV4cCI6MjA5OTAyODAxMX0.NXeAbzvvoUOpXlKGwnEuubJ4_tcfy6ZurULcY8ED7AQ",
  bucket: "article-images",
};