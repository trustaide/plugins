#!/usr/bin/env node
// eli5_icons.mjs
//
// eli5 スキル用のアイコン検証・取得ツール。Node標準ライブラリのみで書く
// （外部npmパッケージへの依存を追加しない）。
//
// コマンド:
//   verify --source=<koboyo|material> --names=<a,b,c>
//     ローカルの名前リスト（references/*.txt）と照合するだけ。ネットワークに触らない。
//   fetch --source=<koboyo|material> --names=<a,b,c>
//     source=koboyo: 各名前のSVGを取得し、1つのSVGスプライトを標準出力に出す。
//     source=material: 取得不要。案内メッセージを標準エラーに出すだけ。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// 定数・パス解決
// ---------------------------------------------------------------------------

const REFERENCES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'references');

const REFERENCE_FILES = {
  koboyo: 'koboyo-names.txt',
  material: 'material-symbols-names.txt',
};

const KOBOYO_SVG_URL = (name) => `https://koboyo.com/icons/svg/${name}.svg`;

const MATERIAL_NO_FETCH_MESSAGE =
  'Material Symbolsは取得不要。<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet"> の1行で読み込む。\n';

// ---------------------------------------------------------------------------
// エラー型
// ---------------------------------------------------------------------------

/** CLI引数の不備など、利用者側の入力エラー。 */
export class UsageError extends Error {}

// ---------------------------------------------------------------------------
// 参照リストの読み込み
// ---------------------------------------------------------------------------

const referenceCache = new Map();

/**
 * source に対応する references/*.txt を読み込み、行の配列として返す。
 * 結果はプロセス内でキャッシュする（ファイルは実行中に変わらない前提）。
 */
export function loadReferenceNames(source) {
  if (referenceCache.has(source)) {
    return referenceCache.get(source);
  }
  const fileName = REFERENCE_FILES[source];
  if (!fileName) {
    throw new UsageError(`unknown source: ${JSON.stringify(source)}`);
  }
  const filePath = path.join(REFERENCES_DIR, fileName);
  const text = fs.readFileSync(filePath, 'utf8');
  const names = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  referenceCache.set(source, names);
  return names;
}

// ---------------------------------------------------------------------------
// 候補探索（編集距離は実装しない。設計書セクション10-1の仕様が正 — 4-2の記述を上書きする）
// ---------------------------------------------------------------------------

/**
 * 名前を "-" と "_" で分割した語リストを返す。1文字の語は捨てる
 * （"a" のような短い語が無関係な候補を大量に拾ってしまうのを防ぐため）。
 */
function splitWords(name) {
  return name.split(/[-_]/).filter((w) => w.length > 1);
}

/** 名前から "-" と "_" をすべて除いた「詰め文字列」を返す。 */
function packName(name) {
  return name.replace(/[-_]/g, '');
}

/**
 * 語 a・b が「一致」とみなせるか。完全一致、または一方がもう一方の前方一致（prefix）。
 */
function wordsMatch(a, b) {
  return a === b || b.startsWith(a) || a.startsWith(b);
}

/**
 * 見つからなかった名前に対する候補を最大 limit 件返す。例外は投げない。
 *
 * 設計書セクション10-1の仕様:
 * 1. 入力名の語リスト（1文字の語は除く）の各語について、候補名の語リストの
 *    いずれかの語と完全一致／前方一致すれば「一致」とみなす。一致した入力語の
 *    個数（重複カウントなし）を m とし、m >= 1 の候補を集める
 * 2. それが0件なら、詰め文字列どうしの部分一致（どちらかがもう一方を含む）で候補を集める
 * 3. それでも0件なら空配列
 *
 * 並び順: ①詰め文字列が完全一致するものを最優先 ②mが大きい順 ③候補の語数が
 * 少ない順 ④候補名の文字数が短い順 ⑤アルファベット昇順（決定性のため）
 */
export function getSuggestions(name, list, limit = 5) {
  const inputWords = splitWords(name);
  const packedInput = packName(name);

  const scored = [];

  // Tier 1: 語リストベースの一致（m >= 1）
  for (const candidate of list) {
    const candidateWords = splitWords(candidate);
    let m = 0;
    for (const t of inputWords) {
      if (candidateWords.some((c) => wordsMatch(t, c))) {
        m += 1;
      }
    }
    if (m >= 1) {
      scored.push({ name: candidate, m, wordCount: candidateWords.length });
    }
  }

  // Tier 2: Tier 1が0件のときだけ、詰め文字列の部分一致にフォールバック
  if (scored.length === 0) {
    for (const candidate of list) {
      const packedCandidate = packName(candidate);
      if (packedCandidate.includes(packedInput) || packedInput.includes(packedCandidate)) {
        scored.push({ name: candidate, m: 0, wordCount: splitWords(candidate).length });
      }
    }
  }

  if (scored.length === 0) return [];

  scored.sort((a, b) => {
    const aExact = packName(a.name) === packedInput ? 0 : 1;
    const bExact = packName(b.name) === packedInput ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    if (a.m !== b.m) return b.m - a.m;

    if (a.wordCount !== b.wordCount) return a.wordCount - b.wordCount;

    if (a.name.length !== b.name.length) return a.name.length - b.name.length;

    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  return scored.slice(0, limit).map((entry) => entry.name);
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

/**
 * names を source のローカル一覧と照合する。ネットワークには触らない。
 * @returns {{source: string, ok: string[], missing: string[], suggestions: Record<string, string[]>}}
 */
export function verifyNames(source, names) {
  if (!REFERENCE_FILES[source]) {
    throw new UsageError(`--source must be "koboyo" or "material" (got: ${JSON.stringify(source)})`);
  }
  if (!Array.isArray(names) || names.length === 0) {
    throw new UsageError('--names is required and must not be empty (comma-separated icon names)');
  }

  const list = loadReferenceNames(source);
  const set = new Set(list);

  const ok = [];
  const missing = [];
  const suggestions = {};

  for (const name of names) {
    if (set.has(name)) {
      ok.push(name);
    } else {
      missing.push(name);
      suggestions[name] = getSuggestions(name, list);
    }
  }

  return { source, ok, missing, suggestions };
}

// ---------------------------------------------------------------------------
// SVG解析（Koboyo）
// ---------------------------------------------------------------------------

/**
 * Koboyoから取得したSVGテキストを解析し、<symbol> 生成に必要な断片を返す。
 * 設計書3-1に書かれていない構造（<defs>/<style>がルート直下にある等）に
 * 出会ったら例外を投げる（勝手に解釈を広げない）。
 */
export function parseKoboyoSvg(svgText, name) {
  const rootMatch = svgText.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/i);
  if (!rootMatch) {
    throw new Error(`unexpected SVG structure for "${name}": no <svg> root element found`);
  }
  const [, attrs, inner] = rootMatch;

  const viewBoxMatch = attrs.match(/\bviewBox\s*=\s*"([^"]*)"/i);
  if (!viewBoxMatch) {
    throw new Error(`unexpected SVG structure for "${name}": missing viewBox attribute on root`);
  }

  if (/<defs\b/i.test(inner) || /<style\b/i.test(inner)) {
    throw new Error(
      `unexpected SVG structure for "${name}": <defs> or <style> found inside <svg> root ` +
        '(not covered by design doc section 3-1; stop and report per section 9)',
    );
  }

  const fillMatch = attrs.match(/\bfill\s*=\s*"([^"]*)"/i);

  return {
    viewBox: viewBoxMatch[1],
    fillAttr: fillMatch ? ` fill="${fillMatch[1]}"` : '',
    inner: inner.trim(),
  };
}

/**
 * 1個のKoboyoアイコンを取得して解析する。fetchImpl はテストから差し込み可能。
 */
export async function fetchKoboyoIcon(name, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(KOBOYO_SVG_URL(name));
  } catch (cause) {
    throw new Error(`network error while fetching "${name}": ${cause && cause.message ? cause.message : cause}`);
  }
  if (!response || !response.ok) {
    const status = response ? response.status : 'no response';
    throw new Error(`unexpected HTTP response for "${name}": ${status}`);
  }
  const text = await response.text();
  const parsed = parseKoboyoSvg(text, name);
  return { name, ...parsed };
}

/**
 * 解析済みアイコンの配列から1つのSVGスプライト文字列を組む。
 */
export function buildSprite(icons) {
  const symbols = icons
    .map(
      (icon) =>
        `  <symbol id="i-${icon.name}" viewBox="${icon.viewBox}"${icon.fillAttr}>${icon.inner}</symbol>`,
    )
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n${symbols}\n</svg>\n`;
}

// ---------------------------------------------------------------------------
// CLI引数パース
// ---------------------------------------------------------------------------

function parseFlags(args) {
  const flags = {};
  for (const arg of args) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) {
      flags[m[1]] = m[2];
    }
  }
  return flags;
}

function parseNamesArg(raw) {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// CLIコマンド本体
//
// runVerify / runFetch は process.exit を直接呼ばない。戻り値の終了コード（数値）
// を runCli / メイン処理側で使う。stdout/stderr は差し替え可能（テスト用）。
// ---------------------------------------------------------------------------

export async function runVerify(flags, { stdout, stderr }) {
  const names = parseNamesArg(flags.names);
  let result;
  try {
    result = verifyNames(flags.source, names);
  } catch (e) {
    if (e instanceof UsageError) {
      stderr.write(`Error: ${e.message}\n`);
      return 1;
    }
    throw e;
  }

  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.missing.length === 0 ? 0 : 1;
}

export async function runFetch(flags, { stdout, stderr, fetchImpl }) {
  const source = flags.source;

  if (source !== 'koboyo' && source !== 'material') {
    stderr.write(`Error: --source must be "koboyo" or "material" (got: ${JSON.stringify(source ?? '')})\n`);
    return 1;
  }

  if (source === 'material') {
    // 取得不要。verify前置きチェックの対象外（設計書4-2）。
    stderr.write(MATERIAL_NO_FETCH_MESSAGE);
    return 0;
  }

  // source === 'koboyo'
  const names = parseNamesArg(flags.names);
  let verifyResult;
  try {
    verifyResult = verifyNames(source, names);
  } catch (e) {
    if (e instanceof UsageError) {
      stderr.write(`Error: ${e.message}\n`);
      return 1;
    }
    throw e;
  }

  if (verifyResult.missing.length > 0) {
    stderr.write(
      `Error: unknown koboyo icon name(s): ${verifyResult.missing.join(', ')}\n` +
        '取得を1件も行わずに中止しました。以下は候補です:\n' +
        `${JSON.stringify(verifyResult.suggestions, null, 2)}\n`,
    );
    return 1;
  }

  const icons = [];
  for (const name of names) {
    try {
      const icon = await fetchKoboyoIcon(name, fetchImpl);
      icons.push(icon);
    } catch (e) {
      stderr.write(`Error: ${e.message}\n`);
      return 2;
    }
  }

  stdout.write(buildSprite(icons));
  return 0;
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

export async function runCli(argv, opts = {}) {
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  if (command === 'verify') {
    return runVerify(flags, { stdout, stderr });
  }
  if (command === 'fetch') {
    return runFetch(flags, { stdout, stderr, fetchImpl });
  }

  stderr.write(`Error: unknown command "${command ?? ''}". Use "verify" or "fetch".\n`);
  return 1;
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exit(exitCode);
}
