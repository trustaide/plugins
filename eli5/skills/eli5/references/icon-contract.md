# アイコン規約

`eli5` スキルがHTML図解にアイコンを使うときに必ず守る規約。
ここに書かれていない仕様判断が必要になったら、推測で埋めずにユーザーに確認する。

## アイコン規約5項目(Phase 3で必ず守る)

1. **実在する名前だけを使う。捏造しない。** 必ず `scripts/eli5_icons.mjs verify` を通す。`verify` で `missing` が出たら、返ってきた候補から選び直して再度 `verify` を通す。**検証を通さないまま次に進んではいけない**
2. **スタイルを統一する。** サイズ・太さ・色の扱いを揃える
3. **意味の一致で選ぶ。** 抽象的な概念に、安易に星・電球・歯車で逃げてはいけない
4. **同じアイコンを1つの成果物で2回以上使わない**
5. **最低4個は使う**(図解として成立しないため)

加えて、**1つの成果物でKoboyoとMaterial Symbolsの2系統を混ぜてはいけない**(トンマナが崩れるため)。どちらを使うかは `SKILL.md` Phase 2のトーン判定表に従う。

## アイコン源1: Koboyo(手書き風)

親しみ系トーン(学習・入門・社内共有・雑談から出た疑問など)で使う。

| 項目 | 値 |
|:--|:--|
| SVG取得URL | `https://koboyo.com/icons/svg/<name>.svg` |
| 認証 | 不要(APIキー・ログインなし) |
| 有効な名前 | `references/koboyo-names.txt`(20,129件) |
| 名前の形式 | kebab-case(例: `rocket` `gear-cog` `abacus-toy`) |
| ライセンス | 個人・商用ともに無償、クレジット表記不要、登録不要 |

### 取得と埋め込み手順

1. `node "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/eli5_icons.mjs" verify --source=koboyo --names=<候補をカンマ区切り>` で実在確認する
2. `missing` があれば `suggestions` から選び直し、再度 `verify` を通す
3. 全件 `ok` になったら `node "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/eli5_icons.mjs" fetch --source=koboyo --names=<確定した名前>` でSVGスプライトを取得する
4. 取得したスプライト(`<svg style="display:none" aria-hidden="true">...</svg>`)をHTMLの先頭に**そのまま埋め込む**(KoboyoのSVGは外部ホストなので `<img src>` では参照できない。CSPで遮断される)
5. 本文では `<svg class="ico"><use href="#i-rocket"/></svg>` のように `<use>` で参照する

### CSSでの扱い

```css
.ico {
  height: 2.5rem;   /* 高さを指定する */
  width: auto;      /* viewBoxが正方形ではないため、幅は指定しない */
  color: var(--ico-color); /* SVGがfill="currentColor"なのでcolorが効く */
}
```

- `viewBox` は正方形ではない(例: `rocket` は `0 0 126 216`)。**CSSで固定の縦横比を当ててはいけない**
- 色はCSSの `color` プロパティで制御する

## アイコン源2: Material Symbols(Google)

業務系トーン(クライアント向け・役員/投資家説明・財務・契約・法務など、社外に見せる文脈)で使う。

| 項目 | 値 |
|:--|:--|
| 読み込み | `<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet">` |
| 記述 | `<span class="material-symbols-outlined">bar_chart</span>` |
| 有効な名前 | `references/material-symbols-names.txt`(4,226件) |
| 名前の形式 | snake_case(例: `bar_chart` `rocket_launch` `trending_up`) |
| ライセンス | 商用可・クレジット不要 |
| 取得 | 不要(`fetch` コマンドは案内メッセージのみ返す) |

Artifactは外部ホストへの通信をCSPで遮断するが、**Google Fontsだけは例外的に許可されている**(`fonts.googleapis.com` と `fonts.gstatic.com`)。したがってMaterial Symbolsは`<link>`1行でArtifact内でも動作する。

### 取得と埋め込み手順

1. `node "${CLAUDE_PLUGIN_ROOT}/skills/eli5/scripts/eli5_icons.mjs" verify --source=material --names=<候補をカンマ区切り>` で実在確認する
2. `missing` があれば `suggestions` から選び直し、再度 `verify` を通す
3. HTMLの先頭(発行時に自動で包まれる `<head>` の中身にあたる位置ではなく、生成するHTML本体の先頭)に `<link>` を1行入れる
4. 本文では `<span class="material-symbols-outlined">bar_chart</span>` のように記述する

## 両アイコン源に共通する注意

- アイコン名は必ず `verify` を通してから使う。**思いつきで名前を書いて `verify` を省略しない**
- `verify` の候補(`suggestions`)は最大5件。0件なら別の言い換えを試す
- KoboyoとMaterial Symbolsを1つの成果物で混在させない
