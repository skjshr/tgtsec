# Yamamoto Mfg. CTF

社内プチ CTF。**山本製作所(Yamamoto Manufacturing Co., Ltd.)** という架空の中小企業の、長年放置された Web サーバーを攻略します。

> 配布: takes-security-hacking-lab

## 概要

| 項目 | 内容 |
|---|---|
| 形式 | Boot2Root (1台のVMを完全制覇) |
| 難度 | 中級初心者(semi-beginner) |
| 想定時間 | 2〜4時間(初心者) / 30〜60分(慣れてる人) |
| カテゴリ | Web exploitation, Linux 権限昇格 |
| フラグ形式 | `TSHL{...}` × 3個 |

## 始め方

1. **OVA をインポート** してVMを起動 (詳細は配布物の `SETUP.md` 参照)
2. 攻撃用VM (Kali Linux など) を同じ Host-Only ネットワークに置く
3. 攻撃用VMから `nmap` でターゲット発見 → CTF開始

## このリポジトリにあるもの

- [`README.md`](README.md) — このファイル
- [`PRIMER.md`](PRIMER.md) — **CTF初参加者はまずこれ**。基礎用語・心構え・ツール導入
- [`WALKTHROUGH-BEGINNER.md`](WALKTHROUGH-BEGINNER.md) — 段階的ヒント集(完全ネタバレなし)
- [`TOOLS-CHEATSHEET.md`](TOOLS-CHEATSHEET.md) — よく使うコマンド一覧

## ルール

- 攻撃対象は提供されたVMのみ。ホストOSや他ネットワークは攻撃禁止
- 詰まったら `WALKTHROUGH-BEGINNER.md` を1段階ずつ開く
- ブルートフォース系を**長時間回さない**(意図された解法では不要です)

楽しんで!
