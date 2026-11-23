import { t } from "./i18n";
// 1.0.3：程式碼格式化（.js / .json，編輯器裡用）。
// JSON 用 JSON.parse + stringify，一定正確；解析失敗就丟錯，呼叫端顯示原因。
// JS 是輕量格式化器：先斷詞（字串、模板字串、註解、正則當成一整塊，
// 裡面絕對不動），再按大括號深度縮排、`;` 跟 `{` `}` 換行、運算子前後補空白。
// 它只改排版，不改語意；遇到看不懂的寫法就照原樣輸出，不會把程式改壞。

export function formatJSON(text: string): string {
  const obj = JSON.parse(text);
  return JSON.stringify(obj, null, 2);
}

type Tok = { kind: "code" | "str" | "comment" | "regex"; value: string };

const KEYWORDS_BEFORE_PAREN = new Set(["if", "for", "while", "switch", "catch", "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "else"]);
const BINARY_OPS = new Set([
  "=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "&=", "|=", "^=", "&&=", "||=", "??=",
  "==", "===", "!=", "!==", "<", ">", "<=", ">=", "&&", "||", "??",
  "+", "-", "*", "/", "%", "**", "<<", ">>", ">>>", "&", "|", "^",
  "=>", "?", ":",
]);
const MULTI_OPS = [
  ">>>=", "**=", "<<=", ">>=", "&&=", "||=", "??=", "===", "!==", "...",
  "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "==", "!=", "<=", ">=", "&&", "||", "??",
  "<<", ">>", "**", "=>", "++", "--",
];

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  // 上一個有意義的 token，用來判斷 / 是正則還是除法：
  // 前面是運算子、關鍵字、開括號、逗號、分號、冒號、問號時，/ 是正則；
  // 前面是識別字、數字、字串、正則、閉括號時，/ 是除法。
  let prevSignificant = "";
  const push = (kind: Tok["kind"], value: string) => {
    toks.push({ kind, value });
    if (kind === "code" && value.trim() !== "") prevSignificant = value;
    else if (kind === "str" || kind === "regex") prevSignificant = "x";
  };
  while (i < n) {
    const c = src[i];
    // 空白直接跳過（格式化器自己決定空白）。
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
    // 註解。
    if (c === "/" && src[i + 1] === "/") {
      let j = i + 2;
      while (j < n && src[j] !== "\n") j++;
      push("comment", src.slice(i, j));
      i = j;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      let j = src.indexOf("*/", i + 2);
      j = j === -1 ? n : j + 2;
      push("comment", src.slice(i, j));
      i = j;
      continue;
    }
    // 字串與模板字串（模板裡的 ${} 也整塊保留，不進去重排）。
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        // 模板字串可以換行；一般字串遇到換行就當作結束（容錯）。
        if (q !== "`" && src[j] === "\n") break;
        j++;
      }
      push("str", src.slice(i, j));
      i = j;
      continue;
    }
    // 正則（啟發式判斷）。
    if (c === "/" && !["x", ")", "]", "}"].includes(prevSignificant) && prevSignificant !== "") {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "[") inClass = true;
        if (src[j] === "]") inClass = false;
        if (src[j] === "/" && !inClass) { j++; break; }
        if (src[j] === "\n") break;
        j++;
      }
      while (j < n && /[a-z]/i.test(src[j])) j++;
      push("regex", src.slice(i, j));
      i = j;
      continue;
    }
    // 數字。
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let j = i;
      while (j < n && /[0-9a-zA-Z_.$]/.test(src[j])) j++;
      push("code", src.slice(i, j));
      i = j;
      continue;
    }
    // 識別字／關鍵字。
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      push("code", src.slice(i, j));
      i = j;
      continue;
    }
    // 多字元運算子。
    let matched = false;
    for (const op of MULTI_OPS) {
      if (src.startsWith(op, i)) {
        push("code", op);
        i += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // 剩下單字元（括號、標點、單字元運算子）。
    push("code", c);
    i++;
  }
  return toks;
}

export function formatJS(src: string): string {
  const toks = tokenize(src);
  const lines: string[] = [];
  let cur = "";
  let indent = 0;
  let paren = 0;
  let bracket = 0;
  // 一元 - / + 後面不補空白（-1、+z）。由下面的 isUnaryMinusPlus 判斷。
  let noSpaceAfterUnary = false;
  // 判斷位置 k 的 - / + 是一元（-1）還是二元（a - b）。
  // 一元：前面是開頭、開括號、逗號、分號、運算子、return 這類關鍵字；
  // 二元：前面是識別字、數字、字串、閉括號（有值）。
  const isUnaryMinusPlus = (k: number): boolean => {
    if (k === 0) return true;
    const p = toks[k - 1];
    if (!p) return true;
    if (p.kind !== "code") return false;
    const v = p.value;
    if (v === ")" || v === "]" || v === "}" || v === "++" || v === "--") return false;
    if (/^[A-Za-z0-9_$]$/.test(v.slice(-1)) || v === "this" || v === "true" || v === "false" || v === "null") {
      // 識別字／數字結尾是有值；但 return/typeof 這類關鍵字後面是一元。
      if (["return", "typeof", "delete", "void", "in", "of", "new", "case"].includes(v)) return true;
      return false;
    }
    return true;
  };
  const IND = "  ";
  const flush = () => {
    if (cur.trim() !== "") lines.push(IND.repeat(Math.max(0, indent)) + cur.trim());
    cur = "";
  };
  // 需不需要在下一個 token 前補空白（看上一個 token 跟下一個 token）。
  const needSpace = (prev: string, next: string): boolean => {
    if (prev === "" || next === "") return false;
    // prev 可能是合併的字串（例如 "g("、"a:"），判斷用最後一個字元。
    const lastPrev = prev.slice(-1);
    if (lastPrev === "(" || lastPrev === "[" || lastPrev === "{" || lastPrev === "." || lastPrev === "!" || lastPrev === "~") return false;
    if (next === ")" || next === "]" || next === "}" || next === "." || next === "," || next === ";" || next === ":") return false;
    if (next === "(") {
      // if/for/while 後面補空白；二元運算子後面也補（= (、+ (、return ()。
      if (KEYWORDS_BEFORE_PAREN.has(prev)) return true;
      if (BINARY_OPS.has(prev)) return true;
      return false;
    }
    if (next === "++" || next === "--") return false;
    if (prev === "++" || prev === "--") return false;
    if (next === "{") {
      // prev 可能是合併的字串（例如 "10)"），看最後一個字元是不是 )。
      if (prev.slice(-1) === ")") return true;
      if (BINARY_OPS.has(prev)) return true;
      if (/[A-Za-z_$]/.test(prev[0])) return true;
      return false;
    }
    if (BINARY_OPS.has(prev) || BINARY_OPS.has(next)) return true;
    // prev 可能是合併的字串（例如 "a:"），看最後一個字元是不是二元運算子，
    // 是的話後面要補空白（a: 1、x = (y) 這類）。
    if (["=", "+", "-", "*", "/", "%", "<", ">", "&", "|", "^", "?", ":"].includes(prev.slice(-1))) return true;
    // 識別字／數字／字串／正則之間補空白；關鍵字後面補空白。
    if (/[A-Za-z0-9_$]/.test(prev.slice(-1)) && /[A-Za-z0-9_$"`]/.test(next[0])) return true;
    if (prev === "}" && /[A-Za-z_$]/.test(next[0])) return true;
    return false;
  };

  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    const v = tk.value;
    const next = toks[k + 1]?.value ?? "";
    const next2 = toks[k + 2]?.value ?? "";

    // 註解：行註解自己一行；區塊註解接著寫。
    if (tk.kind === "comment") {
      if (v.startsWith("//")) {
        if (cur.trim() !== "") cur += " ";
        cur += v;
        flush();
      } else {
        if (cur !== "" && needSpace(cur.slice(-1) === " " ? cur.trim().slice(-1) : cur.trim().slice(-1), v[0])) cur += " ";
        cur += v;
        if (next !== "") cur += " ";
      }
      continue;
    }

    if (tk.kind === "str" || tk.kind === "regex") {
      if (cur !== "") {
        const prevTok = cur.trim().slice(-1);
        // 一元 - / + 後面不補空白（-"a"），用完清掉。
        if (noSpaceAfterUnary) noSpaceAfterUnary = false;
        else if (needSpace(prevTok === "" ? "" : cur.trim().split(/\s+/).pop() || "", v)) cur += " ";
        else if (/[A-Za-z0-9_$)\]]/.test(prevTok) && prevTok !== "") cur += " ";
      }
      cur += v;
      continue;
    }

    // 以下都是 code token。
    if (v === "(") { paren++; cur += noSpaceAfterUnary ? (noSpaceAfterUnary = false, "(") : (needSpace(cur.trim().split(/\s+/).pop() || "", v) ? " (" : "("); continue; }
    if (v === ")") { paren = Math.max(0, paren - 1); cur += ")"; continue; }
    if (v === "[") { bracket++; cur += noSpaceAfterUnary ? (noSpaceAfterUnary = false, "[") : (needSpace(cur.trim().split(/\s+/).pop() || "", v) ? " [" : "["); continue; }
    if (v === "]") { bracket = Math.max(0, bracket - 1); cur += "]"; continue; }
    if (v === "{") {
      // 空區塊 {} 保持一行。
      if (next === "}") {
        if (cur !== "" && needSpace(cur.trim().split(/\s+/).pop() || "", v)) cur += " ";
        cur += "{}";
        k++;
        // {} 後面如果是新陳述句的開頭（function/const/識別字…）就換行；
        // 如果是 ; / ) / , / 運算子，就是同一個表達式的一部分，不換行。
        // else / catch / finally / while 是接續，不換行。
        if (/^[A-Za-z_$]/.test(next2) && !["else", "catch", "finally", "while"].includes(next2)) flush();
        continue;
      }
      if (cur !== "" && needSpace(cur.trim().split(/\s+/).pop() || "", v)) cur += " ";
      cur += "{";
      flush();
      indent++;
      continue;
    }
    if (v === "}") {
      // 先把區塊裡最後一行用原本的縮排送出，再降一層寫 }。
      // （之前先降縮排才送出，區塊最後一行會少一層縮排。）
      flush();
      indent = Math.max(0, indent - 1);
      cur = "}";
      // } 後面接 else / catch / finally / while（do-while）、; 或 , 時先不換行，
      // 讓下一個 token 自己接上去（空白由 needSpace 決定，不在這裡先加）。
      // 沒加 , 的話，物件裡 {x: {...}, z: 3} 的逗號會被送到下一行開頭。
      if (next === "else" || next === "catch" || next === "finally" || next === "while" || next === ";" || next === ",") {
        // 不 flush，cur 保持 "}"
      } else {
        flush();
      }
      continue;
    }
    if (v === ";") {
      cur += ";";
      // for ( ; ; ) 裡的分號不換行，但後面補一個空白（for (let i = 0; i < 10; …）。
      if (paren === 0) flush();
      else cur += " ";
      continue;
    }
    if (v === ",") {
      cur += ", ";
      continue;
    }
    if (v === "case" || v === "default") {
      flush();
      // 不在這裡加尾巴空白，下一個 token 的 needSpace 會補（之前會多一個空白）。
      cur = v;
      continue;
    }
    if (v === ":") {
      // case / default 的冒號：接著換行；三元跟物件的冒號：前面不補、後面補一個。
      const isCaseLabel = cur.trim() === "case" || cur.trim().startsWith("case ") || cur.trim() === "default";
      if (isCaseLabel) {
        cur += ":";
        flush();
      } else {
        cur = cur.trimEnd() + ":";
      }
      continue;
    }
    if (v === "?" && next === ".") { cur += "?."; k++; continue; }
    if (v === "?" && next === "?") { /* ?? 由 MULTI_OPS 處理，不會走到這 */ cur += "?"; continue; }
    // 一般 token：需要就補空白。
    if (cur !== "") {
      const prevWord = cur.trim().split(/\s+/).pop() || "";
      // 前一個是一元 - / + 時，後面不補空白（-1、+z），用完就清掉。
      if (noSpaceAfterUnary) {
        noSpaceAfterUnary = false;
      } else if (needSpace(prevWord, v)) {
        cur += " ";
      }
    }
    cur += v;
    // 這個 token 是一元 - / + 時，記下來讓下一個 token 不補空白。
    noSpaceAfterUnary = (v === "-" || v === "+") && isUnaryMinusPlus(k);
  }
  flush();
  return lines.join("\n");
}

// 依副檔名選格式化器。回傳格式化後的文字；JSON 解析失敗就丟錯。
export function formatCode(text: string, ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "json") return formatJSON(text);
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(e)) return formatJS(text);
  throw new Error(t("不支援的檔案類型","不支持的文件类型","Unsupported file type"));
}

// 編輯器裡顯示格式化按鈕的副檔名。
export function isFormattableExt(ext: string): boolean {
  return ["json", "js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext.toLowerCase().replace(/^\./, ""));
}
