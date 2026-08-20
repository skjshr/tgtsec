document.documentElement.classList.add("js-enabled");

const search = document.querySelector("#reference-search");
const kindInputs = [...document.querySelectorAll('input[name="kind"]')];
const items = [...document.querySelectorAll(".reference-item")];
const resultCount = document.querySelector("#result-count");
const emptyResult = document.querySelector("#empty-result");
const copyStatus = document.querySelector("#copy-status");

function normalized(value) {
  return value.normalize("NFKC").toLocaleLowerCase("ja").trim();
}

function selectedKind() {
  return kindInputs.find((input) => input.checked)?.value ?? "all";
}

function updateResults() {
  const query = normalized(search.value);
  const kind = selectedKind();
  let visible = 0;

  for (const item of items) {
    const matchesKind = kind === "all" || item.dataset.kind === kind;
    const matchesQuery = !query || normalized(item.textContent).includes(query);
    const matches = matchesKind && matchesQuery;
    item.hidden = !matches;
    if (matches) {
      visible += 1;
      if (query) item.querySelector("details").open = true;
    }
  }

  resultCount.textContent = `${visible}件を表示しています`;
  emptyResult.hidden = visible !== 0;
}

search.addEventListener("input", updateResults);
for (const input of kindInputs) input.addEventListener("change", updateResults);

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

for (const button of document.querySelectorAll(".copy-button")) {
  button.addEventListener("click", async () => {
    const code = button.closest(".command-row")?.querySelector("code");
    if (!code) return;

    const originalLabel = button.textContent;
    try {
      await copyText(code.textContent.trim());
      button.textContent = "コピー済み";
      copyStatus.textContent = "コマンドをコピーしました。";
    } catch {
      button.textContent = "失敗しました";
      copyStatus.textContent = "コピーできませんでした。コマンドを選択してコピーしてください。";
    }

    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 1800);
  });
}
