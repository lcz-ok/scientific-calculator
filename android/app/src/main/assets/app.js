// ===== 科学计算器 v5.0 =====
//
// 输入模型：atoms（原子数组）+ caret（光标在显示文本中的字符下标）
// - 数字原子可逐字符编辑：点击任意位置定位光标，可在任意位置插入/删除
// - 函数、括号、运算符等原子整体编辑，光标自动吸附到原子边界
// - 结果只在按下 = 后显示；输入阶段只显示表达式和一个闪烁光标

const state = {
  atoms: [],
  caret: 0,
  result: 0,
  angleMode: 'Deg',   // Deg / Rad
  inv: false,         // 反函数模式
  memory: 0,          // 存储器
  justEvaluated: false,
  error: false,
};

const $ = (id) => document.getElementById(id);
const expressionEl = $('expression');
const resultEl = $('result');
const modeIndicator = $('modeIndicator');

const OP_TEXT = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^', root: 'ʸ√' };
const FUNC_TEXT = {
  sin: 'sin(', cos: 'cos(', tan: 'tan(',
  asin: 'asin(', acos: 'acos(', atan: 'atan(',
  ln: 'ln(', log: 'log(', sqrt: '√(', cbrt: '∛(',
  exp: 'e^(', pow10: '10^(',
};

const numAtom = (s) => ({ t: 'num', s });
const opAtom = (v) => ({ t: 'op', s: OP_TEXT[v], v });
const lpAtom = () => ({ t: 'lparen', s: '(' });
const rpAtom = () => ({ t: 'rparen', s: ')' });
const constAtom = (k) => ({ t: 'const', s: k === 'pi' ? 'π' : 'e', v: k });
const funcAtom = (f) => ({ t: 'func', s: FUNC_TEXT[f], v: f });
const postfixAtom = (k) => ({ t: 'postfix', s: k === 'fact' ? '!' : '%', v: k });

// ---------- 原子 / 光标工具 ----------
function atomsText() { return state.atoms.map(a => a.s).join(''); }

function totalLen() {
  let n = 0;
  for (const a of state.atoms) n += a.s.length;
  return n;
}

// 返回光标两侧的原子；若光标落在原子内部则返回 inside/offset
function atomsBeforeAfter(c) {
  let p = 0;
  for (let i = 0; i < state.atoms.length; i++) {
    const a = state.atoms[i];
    const len = a.s.length;
    if (c > p && c < p + len) {
      return { idx: i, left: a, right: a, inside: a, offset: c - p };
    }
    if (c === p) {
      return { idx: i, left: i > 0 ? state.atoms[i - 1] : null, right: a };
    }
    if (c === p + len) {
      return { idx: i + 1, left: a, right: i + 1 < state.atoms.length ? state.atoms[i + 1] : null };
    }
    p += len;
  }
  const last = state.atoms.length ? state.atoms[state.atoms.length - 1] : null;
  return { idx: state.atoms.length, left: last, right: null };
}

// 光标所在原子（落在末尾边界时返回 null）
function atomContaining(c) {
  let p = 0;
  for (let i = 0; i < state.atoms.length; i++) {
    const len = state.atoms[i].s.length;
    if (c >= p && c < p + len) return { idx: i, offset: c - p, atom: state.atoms[i] };
    p += len;
  }
  return null;
}

// 合法光标位置：数字内部任意位置；其它原子内部吸附到最近边界
function legalCaret(c) {
  c = Math.max(0, Math.min(totalLen(), c));
  const info = atomContaining(c);
  if (info && info.atom.t !== 'num') {
    const start = c - info.offset;
    return info.offset < info.atom.s.length / 2 ? start : start + info.atom.s.length;
  }
  return c;
}

// 光标不能停在数字内部（用于插入运算符、括号、函数等整体原子）
function snapOutOfNum() {
  const c = legalCaret(state.caret);
  const info = atomContaining(c);
  if (info && info.atom.t === 'num' && info.offset > 0) {
    state.caret = c - info.offset + info.atom.s.length;
  } else {
    state.caret = c;
  }
}

function moveCaret(delta) {
  const cur = legalCaret(state.caret);
  let t = Math.max(0, Math.min(totalLen(), cur + delta));
  const info = atomContaining(t);
  if (info && info.atom.t !== 'num') {
    t = delta > 0 ? (t - info.offset + info.atom.s.length) : (t - info.offset);
  }
  state.caret = Math.max(0, Math.min(totalLen(), t));
}

function isValueEnd(a) {
  if (!a) return false;
  if (a.t === 'num') return a.s !== '' && a.s !== '-';
  return a.t === 'const' || a.t === 'rparen' || a.t === 'postfix';
}

function isValueStart(a) {
  if (!a) return false;
  return a.t === 'num' || a.t === 'const' || a.t === 'func' || a.t === 'lparen';
}

// ---------- 数字输入（逐字符编辑） ----------
function insertDigitChar(ch) {
  const c = legalCaret(state.caret);
  const inside = atomContaining(c);
  // 光标在数字内部
  if (inside && inside.atom.t === 'num') {
    const num = inside.atom;
    if (ch === '.' && num.s.includes('.')) return;
    const pos = inside.offset;
    let s = num.s;
    if (s === '0' && pos === s.length && ch !== '.') s = ch;
    else s = s.slice(0, pos) + ch + s.slice(pos);
    num.s = s;
    state.caret = c + 1;
    return;
  }
  const { idx, left, right } = atomsBeforeAfter(c);
  // 紧贴数字末尾 -> 追加
  if (left && left.t === 'num') {
    if (ch === '.' && left.s.includes('.')) return;
    if (left.s === '0' && ch !== '.') left.s = ch;
    else left.s += ch;
    state.caret = c + 1;
    return;
  }
  // 紧贴数字开头 -> 前插
  if (right && right.t === 'num' && !isValueEnd(left)) {
    if (ch === '.' && right.s.includes('.')) return;
    if (right.s === '0' && ch !== '.') right.s = ch;
    else right.s = ch + right.s;
    state.caret = c + 1;
    return;
  }
  // 新建数字原子（必要时补隐式乘号）
  const list = [];
  if (isValueEnd(left)) list.push(opAtom('*'));
  list.push(numAtom(ch === '.' ? '0.' : ch));
  state.atoms.splice(idx, 0, ...list);
  let added = 0;
  for (const a of list) added += a.s.length;
  state.caret = c + added;
}

function inputDigit(d) {
  if (state.error) clearAll();
  if (state.justEvaluated) { state.atoms = []; state.caret = 0; state.justEvaluated = false; }
  insertDigitChar(d);
  render();
}

function inputDot() {
  if (state.error) clearAll();
  if (state.justEvaluated) { state.atoms = []; state.caret = 0; state.justEvaluated = false; }
  insertDigitChar('.');
  render();
}

// ---------- 运算符 ----------
function inputOp(v) {
  if (state.error) return;
  if (state.justEvaluated) continueFromResult();
  snapOutOfNum();
  const c = legalCaret(state.caret);
  const { idx, left } = atomsBeforeAfter(c);

  // 一元负号：表达式开头 / 左括号后 / 运算符后
  if (v === '-' && (!left || left.t === 'op' || left.t === 'lparen' || left.t === 'func')) {
    state.atoms.splice(idx, 0, numAtom('-'));
    state.caret = c + 1;
    render();
    return;
  }
  if (left && left.t === 'op') {
    left.v = v;
    left.s = OP_TEXT[v];
    state.caret = c;
  } else if (isValueEnd(left)) {
    const a = opAtom(v);
    state.atoms.splice(idx, 0, a);
    state.caret = c + a.s.length;
  }
  render();
}

// ---------- 括号 ----------
function parenDepthBefore(c) {
  let depth = 0, pos = 0;
  for (const a of state.atoms) {
    if (pos >= c) break;
    if (a.t === 'lparen' || a.t === 'func') depth++;
    else if (a.t === 'rparen') depth--;
    pos += a.s.length;
  }
  return depth;
}

function inputParen(p) {
  if (state.error) clearAll();
  if (state.justEvaluated) {
    if (p === '(') { state.atoms = []; state.caret = 0; state.justEvaluated = false; }
    else return;
  }
  if (p === '(') {
    snapOutOfNum();
    const c = legalCaret(state.caret);
    const { idx, left } = atomsBeforeAfter(c);
    const list = [];
    if (isValueEnd(left)) list.push(opAtom('*'));
    list.push(lpAtom());
    state.atoms.splice(idx, 0, ...list);
    state.caret = c + list.length;
  } else {
    snapOutOfNum();
    const c = legalCaret(state.caret);
    const { left } = atomsBeforeAfter(c);
    // 不允许空括号
    if (left && (left.t === 'lparen' || left.t === 'func')) return;
    if (parenDepthBefore(c) > 0) {
      state.atoms.splice(atomsBeforeAfter(c).idx, 0, rpAtom());
      state.caret = c + 1;
    }
  }
  render();
}

// ---------- 常量 ----------
function inputConst(k) {
  if (state.error) clearAll();
  if (state.justEvaluated) { state.atoms = []; state.caret = 0; state.justEvaluated = false; }
  snapOutOfNum();
  const c = legalCaret(state.caret);
  const { idx, left } = atomsBeforeAfter(c);
  const list = [];
  if (isValueEnd(left)) list.push(opAtom('*'));
  list.push(constAtom(k));
  state.atoms.splice(idx, 0, ...list);
  state.caret = c + list.length;
  render();
}

// ---------- 函数 ----------
function inputFunc(f) {
  if (state.error) clearAll();
  if (state.justEvaluated) { state.atoms = []; state.caret = 0; state.justEvaluated = false; }
  snapOutOfNum();
  const c = legalCaret(state.caret);
  const { idx, left } = atomsBeforeAfter(c);
  const list = [];
  if (isValueEnd(left)) list.push(opAtom('*'));
  const fa = funcAtom(f);
  list.push(fa);
  state.atoms.splice(idx, 0, ...list);
  let added = 0;
  for (const a of list) added += a.s.length;
  state.caret = c + added;
  render();
}

// ---------- 后置运算: x² / x³ / x! / % ----------
function appendPostfix(kind) {
  if (state.error) return;
  if (state.justEvaluated) continueFromResult();
  snapOutOfNum();
  const c = legalCaret(state.caret);
  const { idx, left } = atomsBeforeAfter(c);
  if (!isValueEnd(left)) return;
  const list = [];
  if (kind === 'sq') { list.push(opAtom('^'), numAtom('2')); }
  else if (kind === 'cb') { list.push(opAtom('^'), numAtom('3')); }
  else if (kind === 'fact') { list.push(postfixAtom('fact')); }
  else if (kind === 'pct') { list.push(postfixAtom('pct')); }
  state.atoms.splice(idx, 0, ...list);
  let added = 0;
  for (const a of list) added += a.s.length;
  state.caret = c + added;
  render();
}

// ---------- 1/x：把光标前的操作数包成 (1÷x) ----------
function findOperandSpanBefore(idx) {
  let i = idx - 1;
  if (i < 0) return null;
  while (i >= 0 && state.atoms[i].t === 'postfix') i--;
  if (i < 0) return null;
  const a = state.atoms[i];
  if (a.t === 'num') {
    if (a.s === '-' || a.s === '') return null;
    return { start: i, end: idx - 1 };
  }
  if (a.t === 'const') return { start: i, end: idx - 1 };
  if (a.t === 'rparen') {
    let depth = 0, j = i;
    while (j >= 0) {
      const t = state.atoms[j];
      if (t.t === 'rparen') depth++;
      else if (t.t === 'lparen' || t.t === 'func') {
        depth--;
        if (depth === 0) break;
      }
      j--;
    }
    if (j < 0) return null;
    return { start: j, end: idx - 1 };
  }
  return null;
}

function inputReciprocal() {
  if (state.error) return;
  if (state.justEvaluated) continueFromResult();
  snapOutOfNum();
  const c = legalCaret(state.caret);
  const { idx } = atomsBeforeAfter(c);
  const span = findOperandSpanBefore(idx);
  if (!span) return;
  const operand = state.atoms.slice(span.start, span.end + 1);
  const wrapped = [lpAtom(), numAtom('1'), opAtom('/'), ...operand, rpAtom()];
  state.atoms.splice(span.start, span.end - span.start + 1, ...wrapped);
  let flat = 0;
  for (let i = 0; i < span.start + wrapped.length; i++) flat += state.atoms[i].s.length;
  state.caret = flat;
  render();
}

// ---------- xʸ / ʸ√x ----------
function inputPower() {
  if (state.error) return;
  if (state.justEvaluated) continueFromResult();
  snapOutOfNum();
  inputOp('^');
}

function inputNthRoot() {
  if (state.error) return;
  if (state.justEvaluated) continueFromResult();
  snapOutOfNum();
  inputOp('root');
}

// ---------- 删除 ----------
function deleteCharAt(pos) {
  const info = atomContaining(pos);
  if (!info) return;
  if (info.atom.t === 'num') {
    info.atom.s = info.atom.s.slice(0, info.offset) + info.atom.s.slice(info.offset + 1);
    if (info.atom.s === '') state.atoms.splice(info.idx, 1);
    state.caret = pos;
  } else {
    // 整体删除该原子
    state.atoms.splice(info.idx, 1);
    state.caret = pos - info.offset;
    // 删除运算符后若两侧都是数字：合并成一个数字，避免显示歧义
    const left = info.idx - 1 >= 0 ? state.atoms[info.idx - 1] : null;
    const right = info.idx < state.atoms.length ? state.atoms[info.idx] : null;
    if (left && right && left.t === 'num' && right.t === 'num') {
      if (right.s.startsWith('-')) {
        state.atoms.splice(info.idx, 0, opAtom('*'));
      } else {
        left.s += right.s;
        state.atoms.splice(info.idx, 1);
      }
    }
  }
}

function backspace() {
  if (state.error) { clearAll(); return; }
  if (state.justEvaluated) {
    // 结果状态下退格：转为编辑结果
    const s = formatNumber(state.result);
    state.atoms = [numAtom(s)];
    state.caret = s.length;
    state.justEvaluated = false;
  }
  const c = legalCaret(state.caret);
  if (c === 0) { render(); return; }
  deleteCharAt(c - 1);
  render();
}

function deleteForward() {
  if (state.error) { clearAll(); return; }
  if (state.justEvaluated) {
    const s = formatNumber(state.result);
    state.atoms = [numAtom(s)];
    state.caret = s.length;
    state.justEvaluated = false;
  }
  const c = legalCaret(state.caret);
  if (c >= totalLen()) { render(); return; }
  deleteCharAt(c);
  render();
}

// ---------- 清除 ----------
function clearAll() {
  state.atoms = [];
  state.caret = 0;
  state.result = 0;
  state.error = false;
  state.justEvaluated = false;
  render();
}

// ---------- 存储器 ----------
function memoryClear() { state.memory = 0; render(); }
function memoryAdd() {
  const v = currentValue();
  if (isFinite(v)) state.memory += v;
  render();
}
function memorySub() {
  const v = currentValue();
  if (isFinite(v)) state.memory -= v;
  render();
}
function memoryRecall() {
  if (state.error) clearAll();
  if (state.justEvaluated) { state.atoms = []; state.caret = 0; state.justEvaluated = false; }
  snapOutOfNum();
  const c = legalCaret(state.caret);
  const { idx, left } = atomsBeforeAfter(c);
  const list = [];
  if (isValueEnd(left)) list.push(opAtom('*'));
  list.push(numAtom(formatNumber(state.memory)));
  state.atoms.splice(idx, 0, ...list);
  let added = 0;
  for (const a of list) added += a.s.length;
  state.caret = c + added;
  render();
}

function currentValue() {
  if (state.error) return NaN;
  const tokens = atomsToTokens();
  if (!tokens.length) return state.result;
  try { return evaluate(prepareTokens(tokens)); } catch (e) { return NaN; }
}

// ---------- 模式切换 ----------
function toggleAngleMode() {
  state.angleMode = state.angleMode === 'Deg' ? 'Rad' : 'Deg';
  render();
}
function toggleInv() {
  state.inv = !state.inv;
  render();
}

// ---------- 求值 ----------
function atomsToTokens() {
  const tokens = [];
  let prevEnd = false;
  for (const a of state.atoms) {
    if (a.t === 'num' && (a.s === '' || a.s === '-')) continue;
    if (prevEnd && isValueStart(a)) tokens.push({ type: 'op', value: '*' });
    switch (a.t) {
      case 'num': tokens.push({ type: 'num', value: a.s }); break;
      case 'op': tokens.push({ type: 'op', value: a.v }); break;
      case 'lparen': tokens.push({ type: 'lparen' }); break;
      case 'rparen': tokens.push({ type: 'rparen' }); break;
      case 'func':
        tokens.push({ type: 'func', value: a.v });
        tokens.push({ type: 'lparen' });
        break;
      case 'const': tokens.push({ type: 'const', value: a.v }); break;
      case 'postfix': tokens.push({ type: a.v === 'fact' ? 'fact' : 'pct' }); break;
    }
    prevEnd = isValueEnd(a);
  }
  return tokens;
}

// 去掉末尾多余运算符，并补全未闭合括号
function prepareTokens(tokens) {
  const t = tokens.slice();
  while (t.length && t[t.length - 1].type === 'op') t.pop();
  let depth = 0;
  for (const x of t) {
    if (x.type === 'lparen') depth++;
    else if (x.type === 'rparen') depth--;
  }
  while (depth > 0) { t.push({ type: 'rparen' }); depth--; }
  return t;
}

function evaluateNow() {
  if (state.error) { clearAll(); return; }
  if (state.justEvaluated) return;
  const tokens = prepareTokens(atomsToTokens());
  if (!tokens.length) return;
  try {
    const val = evaluate(tokens);
    if (!isFinite(val)) throw new Error('math error');
    state.result = val;
    state.justEvaluated = true;
    // 表达式行显示完整的表达式（含自动补全的括号）
    state.atoms = tokensToAtoms(tokens);
  } catch (e) {
    state.error = true;
  }
  render();
}

// 把补全后的 token 还原成原子，用于「按 = 后上方小字」显示
function tokensToAtoms(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'num') out.push(numAtom(t.value));
    else if (t.type === 'op') out.push(opAtom(t.value));
    else if (t.type === 'lparen') out.push(lpAtom());
    else if (t.type === 'rparen') out.push(rpAtom());
    else if (t.type === 'const') out.push(constAtom(t.value));
    else if (t.type === 'fact') out.push(postfixAtom('fact'));
    else if (t.type === 'pct') out.push(postfixAtom('pct'));
    else if (t.type === 'func') {
      // 函数后面紧跟的 lparen 合并进函数原子
      if (i + 1 < tokens.length && tokens[i + 1].type === 'lparen') {
        out.push(funcAtom(t.value));
        i++;
      } else {
        out.push(funcAtom(t.value));
      }
    }
  }
  return out;
}

// 按 = 后继续运算：把表达式折叠成上一次结果
function continueFromResult() {
  if (!state.justEvaluated) return;
  const s = formatNumber(state.result);
  state.atoms = [numAtom(s)];
  state.caret = s.length;
  state.justEvaluated = false;
}

// ===== 表达式求值 (shunting-yard + RPN) =====
function evaluate(tokens) {
  return evalRPN(toRPN(tokens));
}

function toRPN(tokens) {
  const out = [];
  const ops = [];
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3, 'root': 3 };
  const rightAssoc = { '^': true, 'root': true };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'num' || t.type === 'const') {
      out.push(t);
    } else if (t.type === 'func') {
      ops.push(t);
    } else if (t.type === 'lparen') {
      ops.push(t);
    } else if (t.type === 'rparen') {
      while (ops.length && ops[ops.length - 1].type !== 'lparen') {
        out.push(ops.pop());
      }
      if (!ops.length) throw new Error('paren mismatch');
      ops.pop(); // pop (
      if (ops.length && ops[ops.length - 1].type === 'func') {
        out.push(ops.pop());
      }
    } else if (t.type === 'op') {
      const o1 = t.value;
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.type === 'func') { out.push(ops.pop()); continue; }
        if (top.type === 'op') {
          const o2 = top.value;
          if ((!rightAssoc[o1] && prec[o1] <= prec[o2]) || (rightAssoc[o1] && prec[o1] < prec[o2])) {
            out.push(ops.pop());
            continue;
          }
        }
        break;
      }
      ops.push(t);
    } else if (t.type === 'fact' || t.type === 'pct') {
      out.push(t);
    }
  }
  while (ops.length) {
    const o = ops.pop();
    if (o.type === 'lparen' || o.type === 'rparen') throw new Error('paren mismatch');
    out.push(o);
  }
  return out;
}

function evalRPN(rpn) {
  const stack = [];
  for (const t of rpn) {
    if (t.type === 'num') {
      stack.push(parseFloat(t.value));
    } else if (t.type === 'const') {
      stack.push(t.value === 'pi' ? Math.PI : Math.E);
    } else if (t.type === 'op') {
      const b = stack.pop();
      const a = stack.pop();
      switch (t.value) {
        case '+': stack.push(a + b); break;
        case '-': stack.push(a - b); break;
        case '*': stack.push(a * b); break;
        case '/':
          if (b === 0) throw new Error('div by zero');
          stack.push(a / b); break;
        case '^': stack.push(Math.pow(a, b)); break;
        case 'root': {
          if (b === 0) throw new Error('root index zero');
          stack.push(a < 0 && Number.isInteger(b) && Math.abs(b) % 2 === 1
            ? -Math.pow(-a, 1 / b)
            : Math.pow(a, 1 / b));
          break;
        }
      }
    } else if (t.type === 'func') {
      const x = stack.pop();
      if (x === undefined) throw new Error('bad func');
      const deg = state.angleMode === 'Deg';
      switch (t.value) {
        case 'sin': stack.push(Math.sin(deg ? x * Math.PI / 180 : x)); break;
        case 'cos': stack.push(Math.cos(deg ? x * Math.PI / 180 : x)); break;
        case 'tan': stack.push(Math.tan(deg ? x * Math.PI / 180 : x)); break;
        case 'asin': { const v = Math.asin(x); stack.push(deg ? v * 180 / Math.PI : v); break; }
        case 'acos': { const v = Math.acos(x); stack.push(deg ? v * 180 / Math.PI : v); break; }
        case 'atan': { const v = Math.atan(x); stack.push(deg ? v * 180 / Math.PI : v); break; }
        case 'ln': stack.push(Math.log(x)); break;
        case 'log': stack.push(Math.log10(x)); break;
        case 'sqrt': stack.push(Math.sqrt(x)); break;
        case 'cbrt': stack.push(Math.cbrt(x)); break;
        case 'exp': stack.push(Math.exp(x)); break;
        case 'pow10': stack.push(Math.pow(10, x)); break;
      }
    } else if (t.type === 'fact') {
      const x = stack.pop();
      if (x === undefined) throw new Error('bad fact');
      stack.push(factorial(x));
    } else if (t.type === 'pct') {
      const x = stack.pop();
      if (x === undefined) throw new Error('bad pct');
      stack.push(x / 100);
    }
  }
  if (stack.length !== 1) throw new Error('bad expr');
  return stack[0];
}

function factorial(n) {
  if (n < 0 || !Number.isInteger(n)) return gamma(n + 1);
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function gamma(z) {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// ---------- 数字格式化 ----------
function formatNumber(n) {
  if (!isFinite(n)) return '错误';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e16 || abs < 1e-9) return n.toExponential(10);
  return parseFloat(n.toPrecision(15)).toString();
}

// ===== 渲染 =====
function render() {
  if (state.error) {
    expressionEl.textContent = atomsText();
    resultEl.textContent = '错误';
  } else if (state.justEvaluated) {
    expressionEl.textContent = atomsText();
    resultEl.textContent = formatNumber(state.result);
  } else {
    expressionEl.textContent = '';
    renderInputLine();
  }
  modeIndicator.textContent = state.angleMode + (state.inv ? ' · Inv' : '');
  updateToggleButtons();
}

function renderInputLine() {
  const caret = Math.max(0, Math.min(totalLen(), state.caret));
  resultEl.textContent = '';
  const frag = document.createDocumentFragment();
  let flat = 0;
  let placed = false;
  for (const a of state.atoms) {
    for (let i = 0; i < a.s.length; i++) {
      if (!placed && caret === flat + i) { frag.appendChild(makeCaret()); placed = true; }
      const span = document.createElement('span');
      span.className = 'ch';
      span.textContent = a.s[i];
      span.dataset.pos = flat + i;
      frag.appendChild(span);
    }
    flat += a.s.length;
  }
  if (!placed) frag.appendChild(makeCaret());
  resultEl.appendChild(frag);
  // 光标滚入可视区域
  const caretEl = document.getElementById('caret');
  if (caretEl && resultEl.scrollHeight > resultEl.clientHeight) {
    caretEl.scrollIntoView({ block: 'nearest' });
  }
}

function makeCaret() {
  const s = document.createElement('span');
  s.className = 'caret';
  s.id = 'caret';
  return s;
}

// 根据点击坐标推算光标位置
function caretFromPoint(x, y) {
  const chars = resultEl.querySelectorAll('.ch');
  if (!chars.length) return 0;
  let best = null, bestD = Infinity;
  chars.forEach((el) => {
    const r = el.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = el; }
  });
  const r = best.getBoundingClientRect();
  const pos = Number(best.dataset.pos);
  return legalCaret(x > r.left + r.width / 2 ? pos + 1 : pos);
}

// ===== 按钮定义 =====
const buttons = [
  { l: '(',   a: () => inputParen('('), c: 'func' },
  { l: ')',   a: () => inputParen(')'), c: 'func' },
  { l: '1/x', a: inputReciprocal, c: 'func' },
  { l: 'MC',  a: memoryClear, c: 'mem' },
  { l: 'M+',  a: memoryAdd, c: 'mem' },
  { l: 'M-',  a: memorySub, c: 'mem' },
  { l: 'MR',  a: memoryRecall, c: 'mem' },

  { l: 'x²',  a: () => appendPostfix('sq'), c: 'func' },
  { l: 'x³',  a: () => appendPostfix('cb'), c: 'func' },
  { l: 'xʸ',  a: inputPower, c: 'func' },
  { l: 'C',   a: clearAll, c: 'op' },
  { l: '÷',   a: () => inputOp('/'), c: 'op' },
  { l: '×',   a: () => inputOp('*'), c: 'op' },
  { l: '⌫',   a: backspace, c: 'op' },

  { l: 'x!',  a: () => appendPostfix('fact'), c: 'func' },
  { l: '√',   a: () => inputFunc('sqrt'), c: 'func' },
  { l: 'ʸ√x', a: inputNthRoot, c: 'func' },
  { l: '7',   a: () => inputDigit('7') },
  { l: '8',   a: () => inputDigit('8') },
  { l: '9',   a: () => inputDigit('9') },
  { l: '−',   a: () => inputOp('-'), c: 'op' },

  { l: 'e',   a: () => inputConst('e'), c: 'func' },
  { l: 'ln',  a: () => inputFunc(state.inv ? 'exp' : 'ln'), c: 'func' },
  { l: 'log', a: () => inputFunc(state.inv ? 'pow10' : 'log'), c: 'func' },
  { l: '4',   a: () => inputDigit('4') },
  { l: '5',   a: () => inputDigit('5') },
  { l: '6',   a: () => inputDigit('6') },
  { l: '+',   a: () => inputOp('+'), c: 'op' },

  { l: 'sin', a: () => inputFunc(state.inv ? 'asin' : 'sin'), c: 'func' },
  { l: 'cos', a: () => inputFunc(state.inv ? 'acos' : 'cos'), c: 'func' },
  { l: 'tan', a: () => inputFunc(state.inv ? 'atan' : 'tan'), c: 'func' },
  { l: '1',   a: () => inputDigit('1') },
  { l: '2',   a: () => inputDigit('2') },
  { l: '3',   a: () => inputDigit('3') },
  { l: '=',   a: evaluateNow, c: 'equals', span: 2 },

  { l: 'Inv', a: toggleInv, c: 'func', id: 'btnInv' },
  { l: 'Rad', a: toggleAngleMode, c: 'func', id: 'btnAngle' },
  { l: 'π',   a: () => inputConst('pi'), c: 'func' },
  { l: '%',   a: () => appendPostfix('pct'), c: 'func' },
  { l: '0',   a: () => inputDigit('0') },
  { l: '.',   a: inputDot },
];

const keypad = $('keypad');
let lastLongClearAt = 0;

buttons.forEach(b => {
  const btn = document.createElement('button');
  btn.className = 'btn ' + (b.c || '');
  if (b.span) btn.classList.add('equals');
  if (b.id) btn.id = b.id;
  btn.dataset.label = b.l;
  if (b.l === 'x²') btn.innerHTML = 'x<sup>2</sup>';
  else if (b.l === 'x³') btn.innerHTML = 'x<sup>3</sup>';
  else if (b.l === 'xʸ') btn.innerHTML = 'x<sup>y</sup>';
  else if (b.l === 'ʸ√x') btn.innerHTML = '<sup>y</sup>√x';
  else btn.textContent = b.l;
  btn.tabIndex = -1;

  // 长按 ⌫ 全部清除
  if (b.l === '⌫') {
    let timer = null;
    const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };
    btn.addEventListener('pointerdown', () => {
      stop();
      timer = setTimeout(() => {
        lastLongClearAt = Date.now();
        clearAll();
        timer = null;
      }, 550);
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
  }

  btn.addEventListener('click', () => {
    if (b.l === '⌫' && Date.now() - lastLongClearAt < 500) return;
    b.a();
    btn.blur();
  });
  keypad.appendChild(btn);
});

function updateToggleButtons() {
  const inv = $('btnInv');
  const ang = $('btnAngle');
  if (inv) inv.classList.toggle('active', state.inv);
  if (ang) {
    ang.textContent = state.angleMode === 'Deg' ? 'Rad' : 'Deg';
    ang.classList.toggle('active', state.angleMode === 'Rad');
  }
}

// ===== 点击显示区定位光标 =====
resultEl.addEventListener('click', (e) => {
  if (state.error) return;
  if (state.justEvaluated) {
    // 点结果区 -> 进入编辑结果
    const s = formatNumber(state.result);
    state.atoms = [numAtom(s)];
    state.justEvaluated = false;
    render();
  }
  state.caret = caretFromPoint(e.clientX, e.clientY);
  render();
});

// ===== 关于弹窗 =====
const aboutOverlay = $('aboutOverlay');
const aboutBtn = $('aboutBtn');
const aboutCloseBtn = $('aboutClose');

function openAbout() { aboutOverlay.hidden = false; }
function closeAbout() { aboutOverlay.hidden = true; aboutCloseBtn.blur(); }

aboutBtn.addEventListener('click', () => { openAbout(); aboutBtn.blur(); });
aboutCloseBtn.addEventListener('click', closeAbout);
aboutOverlay.addEventListener('click', (e) => { if (e.target === aboutOverlay) closeAbout(); });

// ===== 键盘支持 =====
document.addEventListener('keydown', (e) => {
  if (!aboutOverlay.hidden) {
    if (e.key === 'Escape' || e.key === 'Enter') { closeAbout(); e.preventDefault(); }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  let handled = true;
  if (k >= '0' && k <= '9') inputDigit(k);
  else if (k === '.') inputDot();
  else if (k === '+') inputOp('+');
  else if (k === '-') inputOp('-');
  else if (k === '*') inputOp('*');
  else if (k === '/') inputOp('/');
  else if (k === '(') inputParen('(');
  else if (k === ')') inputParen(')');
  else if (k === '^') inputPower();
  else if (k === '%') appendPostfix('pct');
  else if (k === '!') appendPostfix('fact');
  else if (k === 'Enter' || k === '=') evaluateNow();
  else if (k === 'Backspace') backspace();
  else if (k === 'Delete') deleteForward();
  else if (k === 'ArrowLeft') { moveCaret(-1); render(); }
  else if (k === 'ArrowRight') { moveCaret(1); render(); }
  else if (k === 'Home') { state.caret = 0; render(); }
  else if (k === 'End') { state.caret = totalLen(); render(); }
  else if (k === 'Escape') clearAll();
  else if (k === 'r' || k === 'R') toggleAngleMode();
  else if (k === 'i' || k === 'I') toggleInv();
  else handled = false;
  if (handled) e.preventDefault();
});

// ===== 启动 =====
render();
// 首次启动（每次打开应用）自动弹出关于
setTimeout(() => { openAbout(); }, 350);
