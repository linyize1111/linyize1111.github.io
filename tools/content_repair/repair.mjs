/**
 * Safe mechanical repairs only.
 * Never invent missing prose. Never change status/published_at.
 * author_voice_priority = very_high
 */
import { normalizeWs, firstParagraph, plainText } from "./detect.mjs";

function defaultCoverDisplay(presentation, existing) {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  const presets = {
    fragment: { style: "none", ratio: "auto", fit: "contain", position: "center center" },
    quote: { style: "none", ratio: "auto", fit: "contain", position: "center center" },
    "photo-note": { style: "inline", ratio: "auto", fit: "contain", position: "center center" },
    journal: { style: "inline", ratio: "4/3", fit: "cover", position: "center center" },
    review: { style: "hero", ratio: "16/9", fit: "cover", position: "center center" },
    longform: { style: "hero", ratio: "16/9", fit: "cover", position: "center 30%" },
    reference: { style: "inline", ratio: "4/3", fit: "contain", position: "center center" },
    fiction: { style: "hero", ratio: "3/2", fit: "cover", position: "center center" },
    poetry: { style: "inline", ratio: "auto", fit: "contain", position: "center center" },
    "article-lite": { style: "inline", ratio: "16/9", fit: "cover", position: "center center" },
  };
  const preset = presets[presentation] || presets["article-lite"];
  return {
    style: base.style || preset.style,
    ratio: base.ratio || preset.ratio,
    fit: base.fit || preset.fit,
    position: base.position || preset.position,
  };
}

export function safeRepairArticle(article, detection) {
  const flags = new Set(detection.flags || []);
  const changes = [];
  let title = article.title || "";
  let body = article.body || "";
  let summary = article.summary || "";
  const cover_display = defaultCoverDisplay(article.presentation, article.cover_display);

  if (JSON.stringify(cover_display) !== JSON.stringify(article.cover_display || {})) {
    changes.push("cover_display_defaults");
  }

  if (flags.has("broken_title_punctuation")) {
    if (title.startsWith("美」")) {
      title = "「美」究竟是怎麼出現的？";
      changes.push("fix_title_punctuation");
    } else if (/^[^「].*」/.test(title) && !title.includes("「")) {
      title = "「" + title;
      changes.push("fix_title_punctuation");
    }
  }

  if (flags.has("title_duplicates_body_opening")) {
    const first = firstParagraph(body);
    const firstPlain = plainText(first);
    const titlePlain = plainText(title);
    // Only strip when the opening block is essentially the title itself
    // (not when the whole article is a short fragment equal to the title).
    const bodyPlain = plainText(body);
    const openingIsTitleOnly =
      firstPlain &&
      titlePlain &&
      (firstPlain === titlePlain || firstPlain === titlePlain + "。") &&
      firstPlain.length <= Math.max(titlePlain.length + 2, 48) &&
      bodyPlain.length > firstPlain.length + 20;

    if (openingIsTitleOnly) {
      const norm = normalizeWs(body);
      const parts = norm.split(/\n\s*\n/);
      let removed = false;
      const next = [];
      for (const part of parts) {
        const p = plainText(part.replace(/^#+\s+/, ""));
        if (!removed && (p === titlePlain || p === titlePlain + "。")) {
          removed = true;
          continue;
        }
        next.push(part);
      }
      if (removed) {
        const candidate = next.join("\n\n").trim();
        // Refuse to wipe the article
        if (candidate.length >= Math.min(40, Math.floor(body.length * 0.5))) {
          body = candidate + "\n";
          changes.push("remove_duplicate_title_from_body");
        }
      }
    }
  }

  if (flags.has("excess_blank_lines")) {
    const next = body.replace(/\n{4,}/g, "\n\n\n");
    if (next !== body) {
      body = next;
      changes.push("collapse_excess_blank_lines");
    }
  }

  // Demote leading H1 that exactly matches title (layout only)
  const h1 = body.match(/^#\s+(.+)\n/);
  if (h1 && plainText(h1[1]) === plainText(title)) {
    body = body.replace(/^#\s+.+?\n+/, "");
    changes.push("strip_duplicate_h1_title");
  }

  // Multiple H1 → demote subsequent H1 to H2 (structure only)
  if (flags.has("multiple_h1")) {
    let seen = 0;
    const next = body.replace(/^#\s+/gm, (m) => {
      seen += 1;
      return seen === 1 ? m : "## ";
    });
    if (next !== body) {
      body = next;
      changes.push("demote_extra_h1");
    }
  }

  return {
    patch: {
      title,
      body,
      summary,
      cover_display,
    },
    changes,
  };
}

/** Suggestions only — never applied without human accept */
export function reviewSuggestions(article, detection) {
  const flags = new Set(detection.flags || []);
  const suggestions = [];
  if (flags.has("summary_is_body_truncation")) {
    suggestions.push({
      field: "summary",
      action: "rewrite_semantic_summary",
      note: "目前 summary 像正文截斷；請人工或 AI 寫語意摘要，禁止直接截 body。",
    });
  }
  if (flags.has("title_looks_like_body")) {
    suggestions.push({
      field: "title",
      action: "propose_short_title",
      note: "標題像整段正文；請人工確認短標題，並確保原文回到 body。",
      proposed_keep_in_body: article.title,
    });
  }
  if (flags.has("heading_hierarchy_skip")) {
    suggestions.push({
      field: "body",
      action: "fix_heading_levels",
      note: "標題階層有跳級；請人工檢查，勿自動重寫內文。",
    });
  }
  return suggestions;
}
