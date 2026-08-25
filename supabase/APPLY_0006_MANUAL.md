# Apply 0006 academic privacy RLS (manual)

Direct Postgres from this machine failed (pooler tenant / IPv6).

1. Open Supabase Dashboard → project `ypyiqysgfwgxcmmsylob` → SQL Editor
2. Paste and run: `migrations/0006_academic_privacy_rls.sql`
3. Verify with anon key:

```js
const { data } = await supabase.from('articles').select('id,category')
  .in('category', ['資訊安全','機器學習','程式語言','人文']);
// expect: data.length === 0 even if any are published
```

Until applied: all academic rows are `draft`, so anon already sees 0 academic rows.
