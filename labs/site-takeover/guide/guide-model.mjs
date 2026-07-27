export const targetIp = "10.13.37.10";

export function classifyScanOutput(output) {
  const text = String(output ?? "");

  if (!text.trim()) {
    return {
      ok: false,
      message: "結果がまだ貼り付けられていません。",
    };
  }

  if (/80\/tcp\s+open\s+(?:http|apache)/i.test(text)) {
    return {
      ok: true,
      message: "80番の入口でWebサイトが待っていると分かりました。ブラウザで見えるページと同じ相手です。",
    };
  }

  if (/host seems down|0 hosts up|failed to resolve/i.test(text)) {
    return {
      ok: false,
      message: "相手PCまで通信が届いていません。LANケーブルとKaliの有線接続表示を運営者と確認してください。",
    };
  }

  if (/80\/tcp\s+closed|80\/tcp\s+filtered/i.test(text)) {
    return {
      ok: false,
      message: "80番がopenになっていません。ターゲットの演習モードが起動しているか、運営者と確認してください。",
    };
  }

  return {
    ok: false,
    message: "貼り付けた結果から80/tcpのopen行を認識できませんでした。その行を含めてもう一度貼り付けてください。",
  };
}

export function classifyDiscoveredPath(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "/staff" || normalized === "/staff/") {
    return {
      ok: true,
      message: "スタッフ用の場所を発見しました。robots.txtは秘密の鍵ではなく、誰でも読める手掛かりだった点が重要です。",
    };
  }

  return {
    ok: false,
    message: "Disallow: の右側をそのまま確認してください。staffという文字が含まれます。",
  };
}

export function classifyCommandOutput(output, prediction) {
  const text = String(output ?? "");

  if (prediction !== "identity") {
    return {
      ok: false,
      message: "whoamiは「この命令を誰として実行しているか」を表示する命令です。目的を選び直してください。",
    };
  }

  if (/(?:^|\s)www-data(?:\s|$)|uid=33\(www-data\)/im.test(text)) {
    return {
      ok: true,
      message: "成功です。ブラウザへ入れた文字から、相手PCがwww-dataという利用者で別の命令を実行しました。",
    };
  }

  if (!text.trim()) {
    return {
      ok: false,
      message: "確認結果がまだ貼り付けられていません。",
    };
  }

  return {
    ok: false,
    message: "www-dataという行が出ているか確認してください。見当たらない場合はセミコロンが半角かを見直します。",
  };
}

export function classifyWorkdirOutput(output) {
  const text = String(output ?? "").trim();

  if (/\/srv\/shop-site\/public\/staff\/?$/m.test(text)) {
    return {
      ok: true,
      message: "現在地はshop-siteのpublic/staffです。publicはブラウザへ公開する部分、その外側にもデータがありそうです。",
    };
  }

  return {
    ok: false,
    message: "結果の中に、/srvから始まる現在地があるか確認してください。",
  };
}

export function classifySiteTreeOutput(output) {
  const text = String(output ?? "");
  const hasData = /(?:^|\s)data(?:\s|$)/m.test(text);
  const hasPublic = /(?:^|\s)public(?:\s|$)/m.test(text);

  if (hasData && hasPublic) {
    return {
      ok: true,
      message: "公開ページのpublicとは別にdataがあります。トップページが読むお知らせはdata側に置かれていそうです。",
    };
  }

  return {
    ok: false,
    message: "一覧の中にdataとpublicの両方があるか確認してください。",
  };
}

export function classifyNoticeOutput(output) {
  const text = String(output ?? "").trim();

  if (text.includes("本日は通常どおり営業しています。") || text.includes("SECURITY TEST SUCCESS:")) {
    return {
      ok: true,
      message: "トップページで見た「本日のお知らせ」と同じ内容です。画面の文字が、このファイルから作られているとつながりました。",
    };
  }

  return {
    ok: false,
    message: "トップページの「本日のお知らせ」と同じ文が表示されたか確認してください。",
  };
}

export function normalizeTeamName(value) {
  const normalized = String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");

  if (!normalized) {
    return { ok: false, message: "チーム名を入力してください。" };
  }

  if (normalized.length > 24) {
    return { ok: false, message: "チーム名は24文字以内にしてください。" };
  }

  if (!/^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z0-9 _ー-]+$/u.test(normalized)) {
    return {
      ok: false,
      message: "日本語、英数字、空白、ハイフン、アンダースコアだけを使えます。",
    };
  }

  return { ok: true, value: normalized };
}

export function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

export function buildDefacePayload(teamName) {
  const normalized = normalizeTeamName(teamName);

  if (!normalized.ok) {
    return normalized;
  }

  const message = `SECURITY TEST SUCCESS: ${normalized.value}`;
  const payload = `127.0.0.1; printf '%s\\n' ${shellSingleQuote(message)} > ../../data/announcement.txt`;

  return {
    ok: true,
    team: normalized.value,
    message,
    payload,
  };
}

export function homepageShowsTeam(html, teamName) {
  const normalized = normalizeTeamName(teamName);

  if (!normalized.ok) {
    return false;
  }

  return String(html ?? "").includes(`SECURITY TEST SUCCESS: ${normalized.value}`);
}

export function scoreDebrief(values) {
  const correct = {
    where: "target",
    privilege: "limited",
    reason: "file",
  };
  const missing = Object.keys(correct).filter((key) => !values[key]);
  const wrong = Object.keys(correct).filter((key) => values[key] && values[key] !== correct[key]);

  return {
    ok: missing.length === 0 && wrong.length === 0,
    missing,
    wrong,
  };
}
