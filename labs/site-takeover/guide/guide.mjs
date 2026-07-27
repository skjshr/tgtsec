import {
  buildDefacePayload,
  classifyCommandOutput,
  classifyDiscoveredPath,
  classifyNoticeOutput,
  classifyScanOutput,
  classifySiteTreeOutput,
  classifyWorkdirOutput,
  homepageShowsTeam,
  scoreDebrief,
} from "/start/guide-model.mjs";

const labInstanceId = "__LAB_INSTANCE_ID__";
const storageKey = `site-takeover-lab-progress-v2-${labInstanceId}`;
const defaultState = {
  completed: [],
  team: "",
};

let state = loadState();

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function feedback(element, message, ok = false) {
  element.textContent = message;
  element.classList.toggle("success", ok);
  element.classList.toggle("error", !ok);
}

function completeStage(stageNumber) {
  if (!state.completed.includes(stageNumber)) {
    state.completed.push(stageNumber);
    state.completed.sort();
    saveState();
  }
  renderProgress();
}

function renderProgress() {
  const completeCount = state.completed.filter((stage) => stage >= 1 && stage <= 4).length;
  const progressLabel = document.querySelector("#progress-label");
  progressLabel.textContent = completeCount === 4 ? "必須ゴール達成" : `必須ゴール ${completeCount} / 4`;

  for (let stage = 1; stage <= 4; stage += 1) {
    const section = document.querySelector(`#stage-${stage}`);
    const status = document.querySelector(`#stage-${stage}-status`);
    const previousComplete = stage === 1 || state.completed.includes(stage - 1);
    const complete = state.completed.includes(stage);
    const body = section.querySelector(".stage-body");

    section.classList.toggle("locked", !previousComplete && !complete);
    section.classList.toggle("complete", complete);
    body.hidden = !previousComplete && !complete;
    body.inert = !previousComplete && !complete;
    status.textContent = complete ? "完了" : previousComplete ? "進行中" : `Stage ${stage - 1}の後`;
  }

  const debrief = document.querySelector("#debrief");
  debrief.classList.toggle("locked", !state.completed.includes(4));
}

document.querySelectorAll("[data-reveal]").forEach((button) => {
  button.addEventListener("click", () => {
    const panel = document.querySelector(`#${button.dataset.reveal}`);
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
});

document.querySelector("#check-site-kind").addEventListener("click", () => {
  const choice = document.querySelector('input[name="site-kind"]:checked')?.value;
  const output = document.querySelector("#site-kind-feedback");

  if (choice === "cafe") {
    feedback(output, "確認できました。これは別のPC上で動く店のWebサイトです。次は、画面に出ていない場所を探します。", true);
    completeStage(1);
    return;
  }

  feedback(output, choice ? "もう一度、新しいタブに見えた画面を確認してください。" : "見えたものを一つ選んでください。");
});

document.querySelector("#check-scan").addEventListener("click", () => {
  const result = classifyScanOutput(document.querySelector("#scan-output").value);
  feedback(document.querySelector("#scan-feedback"), result.message, result.ok);
  if (result.ok) completeStage(1);
});

document.querySelector("#check-path").addEventListener("click", () => {
  const result = classifyDiscoveredPath(document.querySelector("#discovered-path").value);
  feedback(document.querySelector("#path-feedback"), result.message, result.ok);
  if (result.ok) completeStage(2);
});

document.querySelector("#reveal-whoami").addEventListener("click", () => {
  const prediction = document.querySelector('input[name="prediction"]:checked')?.value;
  const output = document.querySelector("#prediction-feedback");
  const panel = document.querySelector("#whoami-experiment");

  if (prediction === "identity") {
    feedback(output, "目的が決まりました。Webの入力が、相手PC上で誰として動くかを確かめます。", true);
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  panel.hidden = true;
  feedback(output, prediction ? "この命令で分かるものをもう一度考えてみてください。" : "知りたいことを一つ選んでください。");
});

document.querySelector("#check-command").addEventListener("click", () => {
  const prediction = document.querySelector('input[name="prediction"]:checked')?.value;
  const result = classifyCommandOutput(document.querySelector("#command-output").value, prediction);
  feedback(document.querySelector("#command-feedback"), result.message, result.ok);
  if (result.ok) completeStage(3);
});

document.querySelector("#check-workdir").addEventListener("click", () => {
  const result = classifyWorkdirOutput(document.querySelector("#workdir-output").value);
  feedback(document.querySelector("#workdir-feedback"), result.message, result.ok);
  document.querySelector("#tree-experiment").hidden = !result.ok;
});

document.querySelector("#check-tree").addEventListener("click", () => {
  const result = classifySiteTreeOutput(document.querySelector("#tree-output").value);
  feedback(document.querySelector("#tree-feedback"), result.message, result.ok);
  document.querySelector("#notice-experiment").hidden = !result.ok;
});

document.querySelector("#check-notice").addEventListener("click", () => {
  const result = classifyNoticeOutput(document.querySelector("#notice-output").value);
  feedback(document.querySelector("#notice-feedback"), result.message, result.ok);
  document.querySelector("#deface-builder").hidden = !result.ok;
});

document.querySelector("#build-payload").addEventListener("click", () => {
  const result = buildDefacePayload(document.querySelector("#team-name").value);
  const panel = document.querySelector("#payload-panel");
  const output = document.querySelector("#copy-feedback");

  if (!result.ok) {
    panel.hidden = false;
    document.querySelector("#deface-payload").textContent = "";
    feedback(output, result.message);
    return;
  }

  state.team = result.team;
  saveState();
  document.querySelector("#deface-payload").textContent = result.payload;
  panel.hidden = false;
  feedback(output, "自分用の入力を作りました。何を書き込む命令なのか、実行前に文字列を確認してください。", true);
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

document.querySelector("#copy-payload").addEventListener("click", async () => {
  const payload = document.querySelector("#deface-payload").textContent;
  const output = document.querySelector("#copy-feedback");

  if (!payload) {
    feedback(output, "先にチーム名を入れて、自分用の入力を作ってください。");
    return;
  }

  try {
    await navigator.clipboard.writeText(payload);
    feedback(output, "コピーしました。接続先の入力欄へ貼り付けます。", true);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#deface-payload"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    feedback(output, "文字列を選択しました。Ctrl+Cでコピーしてください。", true);
  }
});

document.querySelector("#check-deface").addEventListener("click", async () => {
  const output = document.querySelector("#deface-feedback");
  const team = state.team || document.querySelector("#team-name").value;

  if (!team) {
    feedback(output, "確認するチーム名がありません。先に自分用の入力を作ってください。");
    return;
  }

  try {
    const response = await fetch(`/?lab-check=${Date.now()}`, { cache: "no-store" });
    const html = await response.text();

    if (response.ok && homepageShowsTeam(html, team)) {
      feedback(output, `侵入成功です。相手PCのWebサイトに「${team}」が表示されています。`, true);
      completeStage(4);
      document.querySelector("#debrief").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    feedback(output, "まだトップページからチーム名を確認できません。入力を実行したか、別タブを再読み込みして確認してください。");
  } catch {
    feedback(output, "ターゲットサイトへ接続できません。LANケーブルと演習モードを運営者と確認してください。");
  }
});

document.querySelector("#debrief-quiz").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const values = Object.fromEntries(form.entries());
  const result = scoreDebrief(values);
  const output = document.querySelector("#quiz-feedback");

  if (result.ok) {
    feedback(output, "説明できています。ブラウザの入力が相手PCの命令になり、限定利用者がページの元データを書き換えました。", true);
    return;
  }

  if (result.missing.length > 0) {
    feedback(output, "まだ選んでいない問いがあります。4枚の因果カードと対応させてみてください。");
    return;
  }

  feedback(output, "4枚の因果カードを左から読み、命令が動いた場所と利用者をもう一度つないでみてください。");
});

document.querySelector("#reset-progress").addEventListener("click", () => {
  const confirmed = window.confirm("このブラウザに保存した演習進捗とチーム名を消しますか？");
  if (!confirmed) return;
  localStorage.removeItem(storageKey);
  window.location.reload();
});

if (state.team) {
  document.querySelector("#team-name").value = state.team;
}

renderProgress();
