-- Main CMS: fix plague article card summary + remove broken carousel image
-- Safe to run multiple times.

begin;

update public.articles
   set summary = '劇情大綱、人物表與哲學層次分類的系列閱讀筆記。',
       images = '[]'::jsonb,
       updated_at = now()
 where section = 'literature'
   and slug = '《鼠疫》閱讀筆記 (一)：劇情大綱與哲學層次分類';

commit;
