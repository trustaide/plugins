# TRUSTAIDE Claude Code プラグイン集

社内で使う Claude Code プラグインを配布するリポジトリ。現在は `eli5`(トピックを図解HTMLで説明し、Artifactとして発行するスキル)を配布している。

## 使う人

TRUSTAIDE・TONYA の2社で使うためのスキル集。リポジトリは公開しているので、GitHubのアカウントやログインは不要。

## インストール手順

Claude Code のターミナルで次を実行する。

```
/plugin marketplace add trustaide/plugins
/plugin install eli5@trustaide-tonya
```

## 注意: VS Code 拡張版を使っている人

**VS Code 拡張版の Claude Code では `/plugin` コマンドが使えない。** 拡張版の利用者は、ターミナルの `claude` CLI から一度上記のインストールを実行する必要がある。インストール後は拡張版でもスキルが使える。

## 更新手順

配布側で `plugin.json` の `version` を上げて push した後、利用者は次を実行する。

```
/plugin marketplace update trustaide-tonya
/plugin update eli5@trustaide-tonya
```

## 使い方の最小例

```
/eli5 ベクトル検索の仕組み
/eli5 --depth=light 生成AIって何
/eli5 --depth=deep --icons=material 事業計画の作り方
```

- `--depth=` : `light` / `standard`(既定) / `deep` で分量を指定する
- `--icons=` : `koboyo`(手書き風・社内向け) / `material`(Material Symbols・社外向け) でアイコン源を指定する。省略時は読み手で自動判定する

詳細は `eli5/README.md` および `eli5/skills/eli5/SKILL.md` を参照。
