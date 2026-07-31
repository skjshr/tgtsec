# Public GitHub reconstruction with Codex CLI

Codex CLIはDebian targetを構築する一時的な保守工具です。GitHub repositoryはpublicの
`https://github.com/skjshr/tgtsec.git`を認証なしで取得します。GitHub login、GitHub CLI、
personal access tokenは使いません。Codexだけをdevice authし、checkoutと認証はgolden state前に
除去します。

## 1. 二つのworkflowを混ぜない

### Clean install

公式Debian 13を専用diskへ新規installし、[PACKAGE-BOOTSTRAP.md](PACKAGE-BOOTSTRAP.md)の
`policy-rc.d`下で工具を導入した状態から開始します。まだplatform CLIがないため
`connectivity-on`は使いません。clone後にpackage一覧、platform overlay、target bundleを作り、
operatorがplatformを適用した時点でquarantineへ移ります。

### Maintenance update

信頼済み復旧直後の`installed-debian-maintenance`だけから開始します。lab用Ethernet cableを
物理的に外し、fresh markerとsession不在をlive検査してから接続を有効にします。

```text
sudo open-world-platform mode \
  --profile /etc/open-world-lab/profile.json \
  --to connectivity-on \
  --confirm "ENABLE MAINTENANCE CONNECTIVITY" \
  --apply
```

exercise後のOS、fresh markerがないOS、vulnerable serviceがactiveなOSでは実行しません。

## 2. 共通のpinned anonymous clone

release担当が承認した40桁のcommit SHAとCodex CLI versionを必ず指定します。branchの先端、
`main`、`latest`をpinの代用にしません。

```text
: "${RELEASE_COMMIT:?set the reviewed 40-hex public release commit}"
: "${CODEX_CLI_VERSION:?set the reviewed exact Codex CLI version}"
case "$RELEASE_COMMIT" in *[!0-9a-f]*|'') exit 64 ;; esac
test "${#RELEASE_COMMIT}" -eq 40
case "$CODEX_CLI_VERSION" in *[!0-9A-Za-z.+-]*|'') exit 64 ;; esac

export CODEX_HOME="$(mktemp -d /var/tmp/open-world-codex.XXXXXX)"
export OPEN_WORLD_BUILD_ROOT="$(mktemp -d /var/tmp/open-world-build.XXXXXX)"
export npm_config_cache="$OPEN_WORLD_BUILD_ROOT/npm-cache"
chmod 700 "$CODEX_HOME" "$OPEN_WORLD_BUILD_ROOT"
printf '%s\n' 'cli_auth_credentials_store = "file"' > "$CODEX_HOME/config.toml"
chmod 600 "$CODEX_HOME/config.toml"

git clone --filter=blob:none --no-checkout \
  https://github.com/skjshr/tgtsec.git \
  "$OPEN_WORLD_BUILD_ROOT/tgtsec"
git -C "$OPEN_WORLD_BUILD_ROOT/tgtsec" checkout --detach "$RELEASE_COMMIT"
test "$(git -C "$OPEN_WORLD_BUILD_ROOT/tgtsec" rev-parse HEAD)" = "$RELEASE_COMMIT"

npm install --prefix "$OPEN_WORLD_BUILD_ROOT/codex-cli" --no-save \
  "@openai/codex@$CODEX_CLI_VERSION"
export OPEN_WORLD_CODEX="$OPEN_WORLD_BUILD_ROOT/codex-cli/node_modules/.bin/codex"
"$OPEN_WORLD_CODEX" --version
"$OPEN_WORLD_CODEX" login --device-auth
```

cloneはanonymous HTTPSだけです。URL、remote、credential helper、shell historyへtokenを入れません。
Codex認証は一時`CODEX_HOME/auth.json`だけへ保存し、OS credential storeへ残しません。
取得したcommitと`codex --version`を構築証跡へ記録します。

clean installでは、Codex実行前にmanifestの全packageを`policy-rc.d`下で導入します。

```text
readarray -t OPEN_WORLD_PACKAGES < <(
  jq -er '.packages[]' \
    "$OPEN_WORLD_BUILD_ROOT/tgtsec/labs/open-world-target/platform/manifest.json"
)
sudo apt-get install --no-install-recommends -- "${OPEN_WORLD_PACKAGES[@]}"
unset OPEN_WORLD_PACKAGES
```

manifestが読めない、package導入中にserviceが起動した場合は停止します。maintenance updateでは
packageを追加せず、platform inventoryの全件確認を使います。

## 3. Codexは検証とdry-runで止める

```text
"$OPEN_WORLD_CODEX" --ask-for-approval on-request exec \
  --ephemeral \
  --sandbox workspace-write \
  -C "$OPEN_WORLD_BUILD_ROOT/tgtsec" \
  - < "$OPEN_WORLD_BUILD_ROOT/tgtsec/labs/open-world-target/operator/CODEX-SETUP-PROMPT.md"
```

operatorはCodexの文章ではなく、test結果、生成manifest、tree hash、live inventory、dry-run planを
確認します。disk、PARTUUID、NIC、hashのいずれかが不明なら停止します。`--apply`は
[PREPARE-TARGET.md](PREPARE-TARGET.md)の二者確認後にoperatorが実行します。

## 4. Connectivity、認証、checkoutを除去する

platform/target bundle適用と再検証後、maintenance updateでは先にconnectivityを止めます。
clean installではplatform適用後のquarantineを確認します。

```text
sudo open-world-platform mode \
  --profile /etc/open-world-lab/profile.json \
  --to connectivity-off \
  --confirm "ENTER MAINTENANCE MODE" \
  --apply

"$OPEN_WORLD_CODEX" logout
case "$CODEX_HOME" in /var/tmp/open-world-codex.*) ;; *) exit 70 ;; esac
case "$OPEN_WORLD_BUILD_ROOT" in /var/tmp/open-world-build.*) ;; *) exit 70 ;; esac
test -d "$CODEX_HOME" && ! test -L "$CODEX_HOME"
test -d "$OPEN_WORLD_BUILD_ROOT" && ! test -L "$OPEN_WORLD_BUILD_ROOT"

ACTUAL_CODEX_HOME="$CODEX_HOME"
ACTUAL_BUILD_ROOT="$OPEN_WORLD_BUILD_ROOT"
printf '%s\n' "$ACTUAL_CODEX_HOME" "$ACTUAL_BUILD_ROOT"
rm -rf -- "$ACTUAL_CODEX_HOME" "$ACTUAL_BUILD_ROOT"
unset CODEX_ACCESS_TOKEN GH_TOKEN GITHUB_TOKEN OPENAI_API_KEY
unset npm_config_cache OPEN_WORLD_CODEX
```

削除対象へ空文字、`/`、`/home`、通常の`~/.codex`を使いません。

## 5. Hygiene gate

```text
sudo --preserve-env=CODEX_ACCESS_TOKEN,GH_TOKEN,GITHUB_TOKEN,OPENAI_API_KEY \
  open-world-build-hygiene \
  --operator-home "$HOME" \
  --transient-path "$ACTUAL_CODEX_HOME" \
  --transient-path "$ACTUAL_BUILD_ROOT"
```

`passed: true`、repository不在、`.git`不在、persistent Codex/GitHub credential不在、secret環境変数不在を
確認します。ここを通過するまでgolden assetを作りません。Codex CLI本体も一時build rootと一緒に
除去されます。exercise modeに外部routeはなく、認証とcheckoutは存在しない状態を必須にします。
