/**
 * Structural anomaly detector for live articles.
 * Flags anomalies; does NOT decide presentation/type by length heuristics.
 */
export function normalizeWs(s) {
  return String(s || "")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function plainText(md) {
  return normalizeWs(md)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>`#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstParagraph(md) {
  const core = normalizeWs(md)
    .replace(/^---[\s\S]*?---\s*/m, "")
    .trim();
  const blocks = core.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (const b of blocks) {
    if (/^!\[/.test(b)) continue;
    if (/^\.(\s*\n\s*\.)*$/.test(b)) continue;
    return b.replace(/^#+\s+/, "").trim();
  }
  return "";
}

export function detectAnomalies(article) {
  const title = normalizeWs(article.title);
  const body = normalizeWs(article.body);
  const summary = normalizeWs(article.summary);
  const plainBody = plainText(body);
  const plainTitle = plainText(title);
  const first = firstParagraph(body);
  const firstPlain = plainText(first);
  const flags = [];

  // Title looks like a full prose paragraph (structural, not type inference)
  if (
    (title.length >= 40 && /[。！？]/.test(title)) ||
    (title.length >= 28 && /，/.test(title) && /[。！？]/.test(title))
  ) {
    flags.push("title_looks_like_body");
  }

  // Title duplicated as body opening
  if (title.length >= 8 && firstPlain && (
    firstPlain === plainTitle ||
    firstPlain.startsWith(plainTitle) ||
    plainTitle.startsWith(firstPlain.slice(0, Math.min(firstPlain.length, plainTitle.length)))
  )) {
    if (Math.abs(firstPlain.length - plainTitle.length) <= 4 || firstPlain.startsWith(plainTitle)) {
      flags.push("title_duplicates_body_opening");
    }
  }

  // Body starts mid-sentence / orphan connector
  if (
    /^[，、；：》」』）\)]/.test(body) ||
    /^(可是|但是|然而|於是|所以|而且|並且|因為|如果|雖然|不過|而我|而他|而她)/.test(plainBody)
  ) {
    flags.push("body_starts_mid_sentence");
  }

  // Summary is truncated body prefix (not semantic)
  if (summary.length >= 40) {
    const sp = plainText(summary);
    if (plainBody.startsWith(sp) || plainBody.slice(0, sp.length + 10).includes(sp.slice(0, Math.min(60, sp.length)))) {
      const ratio = sp.length / Math.max(plainBody.length, 1);
      if (ratio >= 0.15 && ratio <= 0.95) flags.push("summary_is_body_truncation");
    }
  }

  // Structural mismatch: very long title + thin body (paste-as-title damage)
  if (title.length >= 36 && plainBody.length > 0 && plainBody.length < title.length) {
    flags.push("body_short_title_long");
  }

  // Suspected eaten opening: short editorial title + body opens abruptly after images-only lead
  const lead = body.split(/\n/).slice(0, 8).join("\n");
  if (
    title.length <= 24 &&
    !/[。！？]/.test(title) &&
    /^(\s*\.|!\[|\s)*\n/.test(body) &&
    plainBody.length < 120 &&
    article.presentation === "photo-note"
  ) {
    flags.push("suspected_eaten_opening");
  }

  // Stub / incomplete markers → manual restore
  if (/完整內容待補|僅保留概要|待補|此篇原先以卡片形式|完整筆記待補|完整建置紀錄待補/.test(body + summary)) {
    flags.push("incomplete_stub_marker");
  }

  // Markdown heading issues
  const heads = [...body.matchAll(/^#{1,6}\s+.+$/gm)].map((m) => m[0].match(/^#+/)[0].length);
  if (heads.filter((h) => h === 1).length > 1) flags.push("multiple_h1");
  for (let i = 1; i < heads.length; i++) {
    if (heads[i] - heads[i - 1] > 1) {
      flags.push("heading_hierarchy_skip");
      break;
    }
  }

  // Excess blank lines
  if (/\n{4,}/.test(body)) flags.push("excess_blank_lines");

  // Broken title punctuation
  if (/^[」』）)]/.test(title) || (/^[^「『"].*[」』]/.test(title) && !title.includes("「") && title.includes("」"))) {
    flags.push("broken_title_punctuation");
  }

  // Title is body-prose and missing from body → content likely parked in title historically
  if (flags.includes("title_looks_like_body") && !plainBody.includes(plainTitle.slice(0, Math.min(20, plainTitle.length)))) {
    flags.push("content_parked_in_title");
  }

  return {
    id: article.id,
    title,
    slug: article.slug,
    presentation: article.presentation,
    flags,
    metrics: {
      titleLen: title.length,
      bodyLen: body.length,
      plainBodyLen: plainBody.length,
      summaryLen: summary.length,
      firstPlainLen: firstPlain.length,
    },
  };
}

export function classify(detection) {
  const f = new Set(detection.flags);
  if (
    f.has("incomplete_stub_marker") ||
    f.has("content_parked_in_title") ||
    (f.has("body_starts_mid_sentence") && f.has("body_short_title_long")) ||
    f.has("suspected_eaten_opening")
  ) {
    return "needs_manual_restore";
  }
  if (
    f.has("title_looks_like_body") ||
    f.has("summary_is_body_truncation") ||
    f.has("body_starts_mid_sentence") ||
    f.has("heading_hierarchy_skip") ||
    f.has("multiple_h1")
  ) {
    return "needs_review";
  }
  if (
    f.has("title_duplicates_body_opening") ||
    f.has("excess_blank_lines") ||
    f.has("broken_title_punctuation")
  ) {
    return "safe_auto_repair";
  }
  if (f.size === 0) return "clean";
  return "needs_review";
}
