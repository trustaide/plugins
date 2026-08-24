// eli5_icons.test.mjs
// TDD: このテストは scripts/eli5_icons.mjs の実装より先に書かれている。
// 設計書セクション8の13ケース＋差し戻し#1（セクション10-1）のケース14〜19に対応する。
//
// 重要: このテストは実ネットワークに接続しない。
// fetch を伴うテストはすべて `fetchImpl` を注入したスタブで完結させる。

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSuggestions,
  verifyNames,
  runCli,
  UsageError,
} from './eli5_icons.mjs';

function makeSink() {
  let buf = '';
  return {
    write(chunk) {
      buf += chunk;
    },
    get text() {
      return buf;
    },
  };
}

// ---------------------------------------------------------------------------
// #1 verify koboyo: 実在名のみ → missing が空・終了コード0相当
// ---------------------------------------------------------------------------
describe('verify koboyo: 実在名のみ', () => {
  it('missing が空になる', () => {
    const result = verifyNames('koboyo', ['rocket', 'brain']);
    assert.deepEqual(result.ok, ['rocket', 'brain']);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.suggestions, {});
  });

  it('runCli 経由でも終了コード0になる', async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const code = await runCli(['verify', '--source=koboyo', '--names=rocket,brain'], {
      stdout,
      stderr,
    });
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout.text);
    assert.equal(parsed.source, 'koboyo');
    assert.deepEqual(parsed.missing, []);
  });
});

// ---------------------------------------------------------------------------
// #2 verify koboyo: 実在名＋捏造名 → 正しく振り分ける
// ---------------------------------------------------------------------------
describe('verify koboyo: 実在名＋捏造名', () => {
  it('ok と missing に正しく振り分ける', () => {
    const result = verifyNames('koboyo', ['rocket', 'totally-made-up-icon-xyz']);
    assert.deepEqual(result.ok, ['rocket']);
    assert.deepEqual(result.missing, ['totally-made-up-icon-xyz']);
    assert.ok('totally-made-up-icon-xyz' in result.suggestions);
  });

  it('runCli 経由では終了コード1になる', async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const code = await runCli(
      ['verify', '--source=koboyo', '--names=rocket,totally-made-up-icon-xyz'],
      { stdout, stderr },
    );
    assert.equal(code, 1);
    const parsed = JSON.parse(stdout.text);
    assert.deepEqual(parsed.ok, ['rocket']);
    assert.deepEqual(parsed.missing, ['totally-made-up-icon-xyz']);
  });
});

// ---------------------------------------------------------------------------
// #3 verify material: snake_caseの実在名を通す
// ---------------------------------------------------------------------------
describe('verify material: snake_caseの実在名', () => {
  it('bar_chart, trending_up はどちらも ok になる', () => {
    const result = verifyNames('material', ['bar_chart', 'trending_up']);
    assert.deepEqual(result.ok, ['bar_chart', 'trending_up']);
    assert.deepEqual(result.missing, []);
  });

  it('実在名＋捏造名も正しく振り分ける', () => {
    const result = verifyNames('material', ['bar_chart', 'not_a_real_icon']);
    assert.deepEqual(result.ok, ['bar_chart']);
    assert.deepEqual(result.missing, ['not_a_real_icon']);
  });
});

// ---------------------------------------------------------------------------
// #4 verify: 捏造名に対し候補が最大5件返る
// ---------------------------------------------------------------------------
describe('getSuggestions: 最大5件', () => {
  it('候補は5件を超えない', () => {
    // 短いトークンはヒット数が多くなりやすいので、実在リストで確認する。
    const result = verifyNames('koboyo', ['totally-made-up-icon-xyz']);
    const suggestions = result.suggestions['totally-made-up-icon-xyz'];
    assert.ok(Array.isArray(suggestions));
    assert.ok(suggestions.length <= 5);
  });

  it('大きな候補リストでも5件にキャップされる（合成リスト）', () => {
    // "a" を含む語だらけの合成リストで tier1 が5件超ヒットする状況を作る。
    const list = ['bag', 'cat', 'hat', 'map', 'tap', 'van', 'zzz'];
    const suggestions = getSuggestions('a-thing', list);
    assert.ok(suggestions.length <= 5);
  });
});

// ---------------------------------------------------------------------------
// #5 verify: 候補が0件のとき空配列を返す（例外を投げない）
// ---------------------------------------------------------------------------
describe('getSuggestions: 候補0件', () => {
  it('一致する語がまったくない場合は空配列を返し、例外を投げない', () => {
    const list = ['apple', 'banana', 'cherry'];
    assert.doesNotThrow(() => {
      const suggestions = getSuggestions('zzz-qq-nomatch', list);
      assert.deepEqual(suggestions, []);
    });
  });

  it('空リストに対しても例外を投げない', () => {
    assert.doesNotThrow(() => {
      const suggestions = getSuggestions('anything', []);
      assert.deepEqual(suggestions, []);
    });
  });
});

// ---------------------------------------------------------------------------
// #6 verify: --names が空 → 明確なエラーメッセージ
// ---------------------------------------------------------------------------
describe('verify: --names が空', () => {
  it('verifyNames を直接呼ぶ場合は UsageError を投げる', () => {
    assert.throws(() => {
      // eslint-disable-next-line no-unused-expressions
      verifyNames('koboyo', []);
    });
  });

  it('runCli 経由では終了コード1と分かりやすいエラーメッセージになる', async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const code = await runCli(['verify', '--source=koboyo', '--names='], { stdout, stderr });
    assert.equal(code, 1);
    assert.equal(stdout.text, '');
    assert.match(stderr.text, /names/i);
  });
});

// ---------------------------------------------------------------------------
// #7 verify: 不正な --source → 明確なエラーメッセージ
// ---------------------------------------------------------------------------
describe('verify: 不正な --source', () => {
  it('runCli 経由で終了コード1と分かりやすいエラーメッセージになる', async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const code = await runCli(['verify', '--source=bogus', '--names=rocket'], {
      stdout,
      stderr,
    });
    assert.equal(code, 1);
    assert.equal(stdout.text, '');
    assert.match(stderr.text, /source/i);
  });
});

// ---------------------------------------------------------------------------
// フィクスチャ: スタブ用の最小SVG（実測構造を模した合成データ）
// ---------------------------------------------------------------------------
const ROCKET_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-label="rocket" viewBox="0 0 126 216"><path d="M1 2z"/></svg>';
const BRAIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-label="brain" viewBox="0 0 195 175"><path d="M3 4z"/></svg>';

function makeStubFetch(svgByName) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const name = Object.keys(svgByName).find((n) => url.includes(`/${n}.svg`));
    if (!name) {
      return { ok: false, status: 404, text: async () => 'Not found' };
    }
    const body = svgByName[name];
    if (body instanceof Error) {
      throw body;
    }
    if (typeof body === 'object' && body.status) {
      return body;
    }
    return { ok: true, status: 200, text: async () => body };
  };
  impl.calls = calls;
  return impl;
}

// ---------------------------------------------------------------------------
// #8 fetch koboyo: スタブしたfetchで2件 → <symbol id="i-...">を2つ含むスプライトを組む
// ---------------------------------------------------------------------------
describe('fetch koboyo: 2件のスプライト生成', () => {
  it('symbol id が2つ含まれる', async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const fetchImpl = makeStubFetch({ rocket: ROCKET_SVG, brain: BRAIN_SVG });

    const code = await runCli(['fetch', '--source=koboyo', '--names=rocket,brain'], {
      stdout,
      stderr,
      fetchImpl,
    });

    assert.equal(code, 0);
    assert.match(stdout.text, /<symbol id="i-rocket"/);
    assert.match(stdout.text, /<symbol id="i-brain"/);
    assert.equal(fetchImpl.calls.length, 2);
  });
});

// ---------------------------------------------------------------------------
// #9 fetch koboyo: 元SVGの viewBox が <symbol> に引き継がれる
// ---------------------------------------------------------------------------
describe('fetch koboyo: viewBoxの引き継ぎ', () => {
  it('元のviewBoxがそのままsymbolに乗る', async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const fetchImpl = makeStubFetch({ rocket: ROCKET_SVG, brain: BRAIN_SVG });

    await runCli(['fetch', '--source=koboyo', '--names=rocket,brain'], {
      stdout,
      stderr,
      fetchImpl,
    });

    assert.match(stdout.text, /<symbol id="i-rocket" viewBox="0 0 126 216"/);
    assert.match(stdout.text, /<symbol id="i-brain" viewBox="0 0 195 175"/);
  });
});

// ---------------------------------------------------------------------------
// #10 fetch koboyo: 捏造名を含む → 1件もネットワークを叩かず終了コード1
// ---------------------------------------------------------------------------
describe('fetch koboyo: 捏造名を含む', () => {
  it('ネットワークを一切叩かず終了コード1になる', async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const fetchImpl = makeStubFetch({ rocket: ROCKET_SVG });

    const code = await runCli(
      ['fetch', '--source=koboyo', '--names=rocket,totally-made-up-icon-xyz'],
      { stdout, stderr, fetchImpl },
    );

    assert.equal(code, 1);
    assert.equal(stdout.text, '');
    assert.equal(fetchImpl.calls.length, 0, 'fetchImpl は一度も呼ばれてはいけない');
    assert.match(stderr.text, /totally-made-up-icon-xyz/);
  });
});

// ---------------------------------------------------------------------------
// #11 fetch koboyo: スタブfetchが500を返す → 終了コード2
// ---------------------------------------------------------------------------
describe('fetch koboyo: 500応答', () => {
  it('終了コード2になり、標準エラーにどの名前か出る', async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const fetchImpl = makeStubFetch({
      rocket: { ok: false, status: 500, text: async () => 'Internal Server Error' },
    });

    const code = await runCli(['fetch', '--source=koboyo', '--names=rocket'], {
      stdout,
      stderr,
      fetchImpl,
    });

    assert.equal(code, 2);
    assert.equal(stdout.text, '');
    assert.match(stderr.text, /rocket/);
  });
});

// ---------------------------------------------------------------------------
// #12 fetch koboyo: スタブfetchが例外を投げる → 終了コード2
// ---------------------------------------------------------------------------
describe('fetch koboyo: fetchが例外を投げる', () => {
  it('終了コード2になる', async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const fetchImpl = makeStubFetch({ rocket: new Error('getaddrinfo ENOTFOUND koboyo.com') });

    const code = await runCli(['fetch', '--source=koboyo', '--names=rocket'], {
      stdout,
      stderr,
      fetchImpl,
    });

    assert.equal(code, 2);
    assert.equal(stdout.text, '');
    assert.match(stderr.text, /rocket/);
  });
});

// ---------------------------------------------------------------------------
// #13 fetch material: 何も出力せず終了コード0
// ---------------------------------------------------------------------------
describe('fetch material: 取得不要', () => {
  it('標準出力は空、終了コード0、標準エラーに案内が出る', async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const fetchImpl = makeStubFetch({});

    const code = await runCli(['fetch', '--source=material', '--names=bar_chart'], {
      stdout,
      stderr,
      fetchImpl,
    });

    assert.equal(code, 0);
    assert.equal(stdout.text, '');
    assert.ok(stderr.text.length > 0);
    assert.equal(fetchImpl.calls.length, 0, 'material では fetch を呼んではいけない');
  });
});

// ---------------------------------------------------------------------------
// 補助: UsageError がexportされていることの確認（内部エラー型の契約）
// ---------------------------------------------------------------------------
describe('UsageError', () => {
  it('Errorのサブクラスである', () => {
    const e = new UsageError('test');
    assert.ok(e instanceof Error);
  });
});

// ---------------------------------------------------------------------------
// 差し戻し#1（設計書セクション10-1）: 候補の順位付け修正
// 実在の参照リスト（references/*.txt）に対して検証する。ネットワークは使わない。
// ---------------------------------------------------------------------------

// #14 verify material: hand_shake → 候補の1件目が handshake
describe('候補順位付け #14: material hand_shake', () => {
  it('候補の1件目が handshake になる', () => {
    const result = verifyNames('material', ['hand_shake']);
    assert.deepEqual(result.missing, ['hand_shake']);
    assert.equal(result.suggestions.hand_shake[0], 'handshake');
  });
});

// #15 verify material: trend_up → 候補の1件目が trending_up
describe('候補順位付け #15: material trend_up', () => {
  it('候補の1件目が trending_up になる', () => {
    const result = verifyNames('material', ['trend_up']);
    assert.deepEqual(result.missing, ['trend_up']);
    assert.equal(result.suggestions.trend_up[0], 'trending_up');
  });
});

// #16 verify koboyo: light-bulb → 候補の1件目が lightbulb
describe('候補順位付け #16: koboyo light-bulb', () => {
  it('候補の1件目が lightbulb になる', () => {
    const result = verifyNames('koboyo', ['light-bulb']);
    assert.deepEqual(result.missing, ['light-bulb']);
    assert.equal(result.suggestions['light-bulb'][0], 'lightbulb');
  });
});

// #17 verify koboyo: hand-shake → 候補の1件目が handshake
describe('候補順位付け #17: koboyo hand-shake', () => {
  it('候補の1件目が handshake になる', () => {
    const result = verifyNames('koboyo', ['hand-shake']);
    assert.deepEqual(result.missing, ['hand-shake']);
    assert.equal(result.suggestions['hand-shake'][0], 'handshake');
  });
});

// #18 verify material: not_a_real_icon → 1文字語("a")だけで引っかかった名前が候補に含まれない
describe('候補順位付け #18: material not_a_real_icon', () => {
  it('1文字の語だけで一致した無関係な候補（1x_mobiledata・18_up_rating）を含まない', () => {
    const result = verifyNames('material', ['not_a_real_icon']);
    const suggestions = result.suggestions.not_a_real_icon;
    assert.ok(!suggestions.includes('1x_mobiledata'));
    assert.ok(!suggestions.includes('18_up_rating'));
  });
});

// #19 同じ入力で2回実行 → 候補の並びが完全に同じ（決定性）
describe('候補順位付け #19: 決定性', () => {
  it('同じ入力を2回verifyしても候補の並びが完全に一致する', () => {
    const first = verifyNames('material', ['not_a_real_icon']).suggestions.not_a_real_icon;
    const second = verifyNames('material', ['not_a_real_icon']).suggestions.not_a_real_icon;
    assert.deepEqual(first, second);
  });
});
