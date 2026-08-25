/**
 * Egress-only game-cover helpers (browser + Node).
 * No Pixiv/Hanime/local-full dependencies.
 */
(function (global) {
  "use strict";

  const MAX_EDGE = 960;
  const MAX_BYTES = 400 * 1024;
  const CACHE_CONTROL = "31536000";
  const BUCKET = "game-covers";

  function extForMime(mime) {
    if (mime === "image/webp") return "webp";
    if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
    return null;
  }

  function mimeForExt(ext) {
    const e = String(ext || "").toLowerCase();
    if (e === "webp") return "image/webp";
    if (e === "jpg" || e === "jpeg") return "image/jpeg";
    return null;
  }

  function buildImmutableCoverPath(sha256Hex, mime) {
    const hex = String(sha256Hex || "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("invalid sha256");
    const ext = extForMime(mime);
    if (!ext) throw new Error("unsupported mime for immutable path");
    return `optimized/v1/${hex}.${ext}`;
  }

  function storageUploadOptions(contentType) {
    return {
      contentType: contentType || "image/jpeg",
      upsert: false,
      cacheControl: CACHE_CONTROL
    };
  }

  function isAlreadyExistsError(message) {
    return /already exists|Duplicate|resource already/i.test(String(message || ""));
  }

  function assertCompressedUploadReady(file, maxBytes = MAX_BYTES) {
    if (!file) return { ok: false, error: "壓縮結果無效，未上傳原始大圖" };
    if (file.size < 32) return { ok: false, error: "壓縮結果無效，未上傳原始大圖" };
    if (file.size > maxBytes) return { ok: false, error: "壓縮結果無效，未上傳原始大圖" };
    if (!extForMime(file.type)) return { ok: false, error: "壓縮輸出格式無效" };
    return { ok: true };
  }

  async function sha256HexOfBlob(blob) {
    const buf = await blob.arrayBuffer();
    return sha256HexOfBuffer(buf);
  }

  async function sha256HexOfBuffer(buf) {
    const subtle = (global.crypto && global.crypto.subtle) || (typeof require === "function" ? require("crypto").webcrypto.subtle : null);
    if (!subtle) throw new Error("SHA-256 unavailable");
    const digest = await subtle.digest("SHA-256", buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Browser-only compression. Node unit tests cover helpers; pixel compress is validated via Python + contract.
   */
  async function compressImageFile(file, { maxEdge = MAX_EDGE, maxBytes = MAX_BYTES } = {}) {
    if (!file || !/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      return { error: "僅支援 PNG / JPG / WEBP / GIF" };
    }
    if (file.size <= maxBytes && /^image\/(jpe?g|webp)$/i.test(file.type)) {
      return { file, skipped: true, reason: "already-small" };
    }
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
      return { error: "此環境無法壓縮圖片" };
    }

    let bitmap;
    try {
      const probe = await createImageBitmap(file);
      const srcW = probe.width;
      const srcH = probe.height;
      probe.close?.();
      const decodeScale = Math.min(1, 2048 / Math.max(srcW, srcH, 1));
      bitmap = await createImageBitmap(file, {
        resizeWidth: Math.max(1, Math.round(srcW * decodeScale)),
        resizeHeight: Math.max(1, Math.round(srcH * decodeScale)),
        resizeQuality: "high"
      });
    } catch {
      return { error: "圖片無法解碼，請改用其他檔案或較小圖片" };
    }

    const edgeScales = [1, 0.85, 0.7, 0.55];
    let best = null;
    for (const edgeMul of edgeScales) {
      const edge = Math.max(64, Math.round(maxEdge * edgeMul));
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height, 1));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) {
        bitmap.close?.();
        return { error: "此瀏覽器無法壓縮圖片（canvas 不可用）" };
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);

      for (const [type, qualities] of [
        ["image/webp", [0.82, 0.72, 0.62, 0.5]],
        ["image/jpeg", [0.85, 0.75, 0.65, 0.55]]
      ]) {
        for (const q of qualities) {
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, q));
          if (!blob || blob.size < 32) continue;
          if (!best || blob.size < best.size) best = { blob, type, width: w, height: h };
          if (blob.size <= maxBytes) break;
        }
        if (best && best.size <= maxBytes) break;
      }
      if (best && best.size <= maxBytes) break;
    }
    bitmap.close?.();

    if (!best) return { error: "圖片壓縮失敗，請改用較小圖片" };
    if (best.size > maxBytes) {
      return { error: `壓縮後仍超過 ${Math.round(maxBytes / 1024)}KB，請改用較小圖片` };
    }
    const ext = extForMime(best.type);
    const out = new File([best.blob], `cover.${ext}`, { type: best.type });
    return {
      file: out,
      skipped: false,
      before: file.size,
      after: out.size,
      width: best.width,
      height: best.height
    };
  }

  /**
   * Pure upload orchestration for unit tests (inject storage + hash).
   * Never uploads original file if compress fails.
   */
  async function prepareGameCoverUpload(file, deps) {
    const maxBytes = deps.maxBytes || MAX_BYTES;
    if (file.size > 5 * 1024 * 1024) {
      return { url: null, error: "原始圖片需小於 5MB（上傳前會再壓縮）", uploaded: false };
    }
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
      return { url: null, error: "僅支援 PNG / JPG / WEBP / GIF", uploaded: false };
    }
    const compressed = await deps.compressImageFile(file, { maxEdge: MAX_EDGE, maxBytes });
    if (compressed.error) {
      return { url: null, error: compressed.error, uploaded: false, calledUpload: false };
    }
    const ready = assertCompressedUploadReady(compressed.file, maxBytes);
    if (!ready.ok) {
      return { url: null, error: ready.error, uploaded: false, calledUpload: false };
    }
    const uploadFile = compressed.file;
    const hash = await deps.sha256HexOfBlob(uploadFile);
    const path = buildImmutableCoverPath(hash, uploadFile.type);
    const options = storageUploadOptions(uploadFile.type);
    const result = await deps.upload(path, uploadFile, options);
    if (result && result.error) {
      if (isAlreadyExistsError(result.error.message)) {
        const verified = deps.verifyExisting
          ? await deps.verifyExisting(path, hash)
          : { ok: true };
        if (!verified.ok) {
          return { url: null, error: verified.error || "既有物件內容不符，已停止", uploaded: false, calledUpload: true, path };
        }
        return {
          url: deps.getPublicUrl(path),
          error: null,
          uploaded: false,
          reused: true,
          calledUpload: true,
          path,
          bytes: uploadFile.size,
          options
        };
      }
      return { url: null, error: result.error.message || "upload failed", uploaded: false, calledUpload: true, path };
    }
    return {
      url: deps.getPublicUrl(path),
      error: null,
      uploaded: true,
      calledUpload: true,
      path,
      bytes: uploadFile.size,
      options,
      compressed: !compressed.skipped
    };
  }

  const api = {
    MAX_EDGE,
    MAX_BYTES,
    CACHE_CONTROL,
    BUCKET,
    extForMime,
    mimeForExt,
    buildImmutableCoverPath,
    storageUploadOptions,
    isAlreadyExistsError,
    assertCompressedUploadReady,
    sha256HexOfBlob,
    sha256HexOfBuffer,
    compressImageFile,
    prepareGameCoverUpload
  };

  global.YoruCoverEgress = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
