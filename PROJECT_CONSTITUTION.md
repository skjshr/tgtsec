# ExamServer 実践ラボ Constitution

## Thesis

IT初心者が、直結したDebian実機を観察し、複数の入口と権限昇格経路から自分で仮説を選び、約90分でrootまでの因果を説明できる、再挑戦可能なオープンワールド演習を作る。

## Moment of satisfaction

参加者が探索地図に自分の発見した経路がつながり、「手順をなぞった」のではなく「この状態から自分で次を選んでrootへ届いた」と理解する。

## One-sentence spec

公開GitHubとCodex CLIから再構築できる専用Debian Boot2Root標的をKaliから直結攻撃し、Kali上のFirefoxで状態に応じて解放される道、次の選択肢、説明が2秒以内に変化し、9経路を90分単位で繰り返し攻略できるラボを提供する。

## Mechanism

1. 標的は中古バイク販売・整備チェーン「風切モータース」の一つの業務環境として見せる。
2. 参加者のWeb到達、共有アクセス、認証、flag参照、権限変化をDebian上で教材イベントとして自動検出する。
3. Kali BridgeはDebianの公開投影を読み、外向きHTTPSだけでクラウドへ中継する。Debianへインターネット経路を与えない。
4. 学習サイトは未接続でも公開ブリーフィングを表示し、ペアリング後は発見済み事実だけをライブ投影する。未発見の正解や完全な世界定義をブラウザへ渡さない。
5. 状況相談は事実から仮説を選ばせ、観察点、道具、操作例の順でヒントを開く。
6. 初期画面は現在地、現在目標、地図／仮説、次の主要操作だけを見せる。補助情報は各画面に一本だけあるラベル付きの `ツール` を引いてから、接続、事実、調査／ヒント、履歴の一種類を選んで開く。画面移動、見た目、演習終了はHeaderの一本の `メニュー` に収納する。
7. 進行の正本は個人プロフィールではなく、標的の確定状態、参加者が選んだ難易度、開放したヒントである。同じ正本状態は誰が開いても同じ現在地と地図を表示する。
8. EASYを初期値にし、参加者は途中でも次候補、道具、構文、実行例、不成功理由、説明量を変更できる。変更は通常進行を失わせない。
9. 未発見箇所はカテゴリと名前のないシルエットだけを見せ、Debianがallowlist済み達成イベントを検出した時だけ名前、事実、道を解放する。
10. 3 footholdすべてから3 root経路へ到達でき、90分を上限とする別セッションで9組合せを遊べる。flagは任意収集物であり進行条件にしない。
11. root取得後はDebian自身のresetを信頼しない。高速復旧は信頼済み外部media、再構築復旧はclean Debianから固定GitHub release/commitとCodexを使う。
12. Codex CLIはmaintenance中の構築工具としてだけ使い、exerciseへ入る前に認証、session、履歴、checkoutの残留検査を通す。公開repositoryの取得にGitHub loginは要求しない。
13. 風切モータースの標的サイトは攻略サイトと視覚・情報設計を共有せず、外部通信のない実在業務サイトとして、見えるページと操作を完成させる。
14. `/bukai`はラボの進行状態に接続しない静的参考文書とし、脆弱性、試すコマンド、CVEの有無を攻略中の任意のタイミングで引けるようにする。

## Architecture grammar

- `apps/lab-guide` は探索地図、状況相談、セッション投影だけを所有する。
- `apps/lab-guide/public/bukai` はLab固有の静的攻略リファレンスだけを所有し、session、telemetry、資格情報、flag本文を所有しない。
- `apps/lab-guide/cloud` は短期ペアリング、セッション状態の単調更新、閲覧者向け配信だけを所有する。アカウント、個人プロフィール、ランキングを所有しない。
- `labs/open-world-target/world` は架空業務環境、意図的脆弱性、flag配置だけを所有する。
- `labs/open-world-target/telemetry` は教材イベントの正規化、状態遷移、公開可能な投影だけを所有する。
- `labs/open-world-target/bridge` はKaliからDebian投影を読み、クラウドへ外向き中継することだけを所有する。
- `labs/open-world-target/platform` はDebian構築、exercise/maintenance分離、直結ネットワーク、復旧だけを所有する。
- `labs/open-world-target/operator` は準備、当日運用、復旧判断、実機証跡だけを所有する。
- ExamServer本体とはコードを直結せず、独立配備したラボを`/lab`と`/api/lab`へreverse proxyする。共有するのはブランドtokens、学習語彙、入口情報、sanitized projectionの境界だけとする。

## Non-goals

- Drupal、DVWA、既存OVA、旧site-takeoverの拡張
- インターネット、会社LAN、第三者システムへの攻撃
- ブルートフォース、マルウェア、永続化、回避技術
- 実在企業、実在人物、実顧客データ、実資格情報の使用
- Debianまたはブラウザから標的LANを公開するトンネル
- ブラウザからの任意コマンド実行
- 生コマンド、端末出力、資格情報、flag文字列のクラウド保存
- root取得後もDebian内のreset処理を信頼すること
- 一つの完全手順だけで全員を完走させること
- CodexやGitHubの認証情報をgolden imageまたはexercise modeへ残すこと
- 画面、fixture、自動testだけをもって完成品と呼ぶこと
- Windows、dual boot、Windows flag、Windows recovery
- 名前、メール、復旧コードを持つ個人プロフィール
- 管理画面、ランキング、streak、永続的な個人実績
- 理解確認クイズ、自由文AI相談、攻略の自動実行
- `/bukai`から標的への通信、進行検出、コマンド実行
- 既知CVEを使っていない設定不備へのCVE番号の割り当て
- 演習であることを標的サイトや攻略画面の本文へ繰り返し表示すること

## Failure modes

1. 地図が正解一覧になり、参加者が仮説を立てずにノードを消化する。
2. 自動検出が生コマンドや秘密を集め、教材より監視システムになる。
3. 一つの入口またはroot経路だけが実用上の正解になり、再挑戦価値が消える。
4. root取得後の標的をそのまま再利用し、次の参加者へ状態や改変が残る。
5. root取得済みDebianから内部resetやGitHub取得を行い、改変済み状態をcleanと誤認する。
6. KaliのWi-Fiと有線LANがルータ化し、隔離したDebianへ外部経路を与える。
7. ライブ接続がない通常閲覧で、故障画面または偽の進行データを表示する。
8. 接続、事実、調査、履歴、設定の入口を初期画面へ並べ、初心者が地図よりUIの解読に時間を使う。
9. 個人プロフィールと標的状態が別々に進み、同じ標的状態なのに参加者ごとに違う道を表示する。
10. 標的サイトが演習説明、動かないリンク、外部素材、サイバー風装飾で架空教材に見える。

## Observable acceptance

- ターミナル未経験に近い参加者がEASYと段階ヒントを使い、任意の一経路を90分以内にrootまで完走できる。
- 入口3種とroot経路3種の9組合せがfresh stateから成立する。
- セッション未接続でも、公開ブリーフィング、世界観、必要機材、安全境界をWebだけで閲覧できる。
- ペアリング済みセッションでは、教材イベントが2秒以内に探索地図または状況相談へ反映される。
- ブラウザbundleと公開APIに未解放ヒント、flag正解、生コマンド、資格情報が含まれない。
- Debian exercise modeにWi-Fi、外部DNS、default route、インターネット疎通がない。
- Kaliがクラウド中継用Wi-Fiを使う場合も、IP forwarding、NAT、EthernetからWi-Fiへの転送が無効である。
- Kali Bridge停止時は最後の確定状態と再接続表示を残し、復帰後に欠落なく追いつく。
- 信頼済み外部mediaからDebian全体をgolden stateへ戻し、同じ経路を再度完走できる。
- clean Debianから公開GitHubの固定release/commitを取得し、Codexで同じschema、配置、9経路を、buildごとのfreshなflag・synthetic credentialとともに再構築できる。secretを含むbundle hashは構築ごとに変わる。
- Firefox ESRの1366×768、1280×720、360pxで主要フローをキーボードだけでも完了できる。
- 初回表示では補助パネルの本文もカテゴリ一覧も見えず、一本の `ツール` を開いた後にラベルと件数から必要な情報を選び、一度に一種類だけ表示できる。
- fresh Debianから別operatorがCodex手順を使って検証済みbundleとdry-run planを再生成でき、exercise開始前にCodex認証、session、履歴、checkoutが存在しない。
- 参加者はKali上のFirefoxだけでpairing、現在地確認、次の仮説選択、段階説明、root完了確認まで進められる。
- 同一の標的進行、難易度、ヒント状態を与えた二つのbrowserは、個人識別なしに同一のカテゴリ、シルエット、現在地、選択肢、説明を表示する。
- 風切モータースの公開・在庫・整備・店舗・記事・FAQ・問い合わせ・staff導線が外部requestなしで動き、演習用装飾や反復説明を主情報にしない。
- `https://exam-server-one.vercel.app/bukai`がAPI、pairing、target接続なしで表示でき、六つの意図的な弱点それぞれに種別、観察点、実行端末を明記したコマンド、CVE有無、成功の見分け方を載せる。
- `/bukai`は生成された資格情報、flag本文、ペアリングtoken、未開放のライブ状態をbundleに含めない。
