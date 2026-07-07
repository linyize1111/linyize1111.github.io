/**
 * supabase-config.js
 *
 * 主網站專屬 Supabase 設定（★ 使用者建立新專案後填入 ★）
 *
 * 安全須知：
 *  - 這裡只能放「新專案」的 Project URL 與 anon(public) key。
 *  - anon key 是「公開只讀」金鑰，可安全出現在前端 / GitHub。
 *  - 絕對不要把 service_role key 放進這個檔案或任何前端檔案！
 *
 * 取得位置：Supabase Dashboard → 你的新專案 → Project Settings →
 *           Data API / API Keys → 複製「Project URL」與「anon public」。
 *
 * 尚未填入前：值維持 __PLACEHOLDER__，前端會偵測到未設定，
 * 全站維持現有靜態 HTML 行為（不會壞掉、也不會嘗試連線）。
 */
window.SUPABASE_CONFIG = {
  // 例：https://abcdefghijklmnop.supabase.co
  url: "__SUPABASE_URL_PLACEHOLDER__",

  // 例：eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....（anon public key）
  anonKey: "__SUPABASE_ANON_KEY_PLACEHOLDER__",

  // Storage bucket（對應 0002_storage.sql）
  bucket: "article-images",
};
