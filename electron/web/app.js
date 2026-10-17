// ===== 科学计算器核心逻辑 =====

const state = {
  tokens: [],          // 内部 token 列表
  result: 0,           // 当前计算结果
  angleMode: 'Deg',    // Deg / Rad
  inv: false,          // 反函数模式
  memory: 0,           // 存储器
  justEvaluated: false, // 刚按过 =
  error: false,
};

// Token 类型: num, op, lparen, rparen, func, const, fact, pct
// op 值: + - * / ^  (内部用 - * /，显示用 − × ÷)
// func 值: sin cos tan asin acos atan ln log sqrt cbrt exp pow10
// const 值: pi e

const $ = (id) => document.getElementById(id);
const expressionEl = $('expression');
const resultEl = $('result');
const modeIndicator = $('modeIndicator');

// ---------- 渲染 ----------
function render() {
  expressionEl.textContent = tokensToString(state.tokens);
  if (state.error) {
    resultEl.textContent = '错误';
  } else {
    resultEl.textContent = formatNumber(state.result);
  }
  modeIndicator.textContent = state.angleMode + (state.inv ? ' · Inv' : '');
}

function tokensToString(tokens) {
  let s = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'num': s += t.value; break;
      case 'op':
        s += t.value === '-' ? '−' : t.value === '*' ? '×' : t.value === '/' ? '÷' : t.value;
        break;
      case 'lparen': s += '('; break;
      case 'rparen': s += ')'; break;
      case 'func': s += funcDisplay(t.value); break;
      case 'const': s += t.value === 'pi' ? 'π' : 'e'; break;
      case 'fact': s += '!'; break;
      case 'pct': s += '%'; break;
    }
  }
  return s;
}

function funcDisplay(f) {
  const map = { pow10: '10^', exp: 'e^', sqrt: '√', cbrt: '∛' };
  return map[f] || f;
}

function formatNumber(n) {
  if (!isFinite(n)) return '错误';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  let s;
  if (abs >= 1e16 || abs < 1e-9) {
    s = n.toExponential(10);
  } else {
    s = parseFloat(n.toPrecision(15)).toString();
  }
  return s;
}

// ---------- Token 辅助 ----------
function lastToken() { return state.tokens[state.tokens.length - 1]; }
function isNumToken(t) { return t && t.type === 'num'; }
function isOpToken(t) { return t && t.type === 'op'; }
function isStartOfExpr() {
  return state.tokens.length === 0 || lastToken().type === 'lparen' ||
    (lastToken().type === 'op' && lastToken().value !== 'fact');
}

// ---------- 数字输入 ----------
function inputDigit(d) {
  if (state.error) clearAll();
  if (state.justEvaluated) {
    state.tokens = [];
    state.justEvaluated = false;
  }
  const lt = lastToken();
  if (isNumToken(lt)) {
    // 不允许前导多个 0
    if (lt.value === '0') lt.value = d;
    else lt.value += d;
  } else {
    // 隐式乘法: 前一个是数字/右括号/阶乘/百分号/常量
    if (lt && (lt.type === 'rparen' || lt.type === 'fact' || lt.type === 'pct' || lt.type === 'const' || lt.type === 'num')) {
      state.tokens.push({ type: 'op', value: '*' });
    }
    state.tokens.push({ type: 'num', value: d });
  }
  updateLiveResult();
  render();
}

function inputDot() {
  if (state.error) clearAll();
  if (state.justEvaluated) {
    state.tokens = [];
    state.justEvaluated = false;
  }
  const lt = lastToken();
  if (isNumToken(lt)) {
    if (!lt.value.includes('.')) lt.value += '.';
  } else {
    if (lt && (lt.type === 'rparen' || lt.type === 'fact' || lt.type === 'pct' || lt.type === 'const' || lt.type === 'num')) {
      state.tokens.push({ type: 'op', value: '*' });
    }
    state.tokens.push({ type: 'num', value: '0.' });
  }
  render();
}

// ---------- 运算符 ----------
function inputOp(op) {
  if (state.error) return;
  state.justEvaluated = false;
  const lt = lastToken();
  // 负号处理
  if (op === '-' && (state.tokens.length === 0 || (lt && (lt.type === 'lparen' || lt.type === 'op')))) {
    // 一元负号: 作为数字的一部分
    state.tokens.push({ type: 'num', value: '-' });
    render();
    return;
  }
  if (isOpToken(lt)) {
    // 替换上一个运算符
    lt.value = op;
  } else if (lt && (lt.type === 'num' || lt.type === 'rparen' || lt.type === 'fact' || lt.type === 'pct' || lt.type === 'const')) {
    state.tokens.push({ type: 'op', value: op });
  } else if (!lt) {
    // 表达式开头，用结果继续
    state.tokens.push({ type: 'num', value: String(state.result) });
    state.tokens.push({ type: 'op', value: op });
  }
  updateLiveResult();
  render();
}

function inputParen(p) {
  if (state.error) clearAll();
  state.justEvaluated = false;
  if (p === '(') {
    const lt = lastToken();
    if (lt && (lt.type === 'num' || lt.type === 'rparen' || lt.type === 'fact' || lt.type === 'pct' || lt.type === 'const')) {
      state.tokens.push({ type: 'op', value: '*' });
    }
    state.tokens.push({ type: 'lparen' });
  } else {
    // 右括号: 只有当有未匹配的左括号时
    let depth = 0;
    for (const t of state.tokens) {
      if (t.type === 'lparen') depth++;
      else if (t.type === 'rparen') depth--;
    }
    if (depth > 0) {
      const lt = lastToken();
      if (lt && lt.type === 'num' && lt.value === '-') return; // 不允许空括号
      state.tokens.push({ type: 'rparen' });
    }
  }
  updateLiveResult();
  render();
}

// ---------- 常量 ----------
function inputConst(c) {
  if (state.error) clearAll();
  if (state.justEvaluated) { state.tokens = []; state.justEvaluated = false; }
  const lt = lastToken();
  if (lt && (lt.type === 'num' || lt.type === 'rparen' || lt.type === 'fact' || lt.type === 'pct' || lt.type === 'const')) {
    state.tokens.push({ type: 'op', value: '*' });
  }
  state.tokens.push({ type: 'const', value: c });
  updateLiveResult();
  render();
}

// ---------- 函数 ----------
function inputFunc(f) {
  if (state.error) clearAll();
  if (state.justEvaluated) { state.tokens = []; state.justEvaluated = false; }
  const lt = lastToken();
  // 隐式乘法
  if (lt && (lt.type === 'num' || lt.type === 'rparen' || lt.type === 'fact' || lt.type === 'pct' || lt.type === 'const')) {
    state.tokens.push({ type: 'op', value: '*' });
  }
  state.tokens.push({ type: 'func', value: f });
  state.tokens.push({ type: 'lparen' });
  render();
}

// ---------- 后置运算: x², x³, x!, %, 1/x ----------
function appendPostfix(op) {
  if (state.error) return;
  const lt = lastToken();
  if (!lt) return;
  if (lt.type === 'num' && lt.value === '-') return;
  if (lt.type === 'op') return;
  if (op === 'sq') {
    state.tokens.push({ type: 'op', value: '^' });
    state.tokens.push({ type: 'num', value: '2' });
  } else if (op === 'cb') {
    state.tokens.push({ type: 'op', value: '^' });
    state.tokens.push({ type: 'num', value: '3' });
  } else if (op === 'fact') {
    state.tokens.push({ type: 'fact' });
  } else if (op === 'pct') {
    state.tokens.push({ type: 'pct' });
  }
  updateLiveResult();
  render();
}

// 1/x: 将最后一个操作数包裹为 (1÷x)
function inputReciprocal() {
  if (state.error) return;
  const span = findLastOperandSpan();
  if (!span) return;
  const operand = state.tokens.slice(span.start, span.end + 1);
  const wrapped = [
    { type: 'lparen' },
    { type: 'num', value: '1' },
    { type: 'op', value: '/' },
    ...operand,
    { type: 'rparen' },
  ];
  state.tokens.splice(span.start, span.end - span.start + 1, ...wrapped);
  updateLiveResult();
  render();
}

// 找到最后一个操作数的 token 范围 [start, end]
function findLastOperandSpan() {
  if (state.tokens.length === 0) return null;
  let i = state.tokens.length - 1;
  const t = state.tokens[i];
  if (t.type === 'num') return { start: i, end: i };
  if (t.type === 'const') return { start: i, end: i };
  if (t.type === 'rparen') {
    let depth = 1;
    let j = i - 1;
    while (j >= 0 && depth > 0) {
      if (state.tokens[j].type === 'rparen') depth++;
      else if (state.tokens[j].type === 'lparen') depth--;
      j--;
    }
    // j 现在是匹配的 ( 的前一个
    // 如果这个 ( 属于一个 func，则 span 从 func 开始
    if (j >= 0 && state.tokens[j + 1].type === 'lparen') {
      let start = j + 1;
      if (j >= 0 && state.tokens[j].type === 'func') start = j;
      return { start, end: i };
    }
    return { start: j + 1, end: i };
  }
  if (t.type === 'fact' || t.type === 'pct') {
    // 找到其操作数的开头
    let k = i - 1;
    while (k >= 0 && (state.tokens[k].type === 'fact' || state.tokens[k].type === 'pct')) k--;
    const sub = findOperandEndingAt(k);
    if (sub) return { start: sub.start, end: i };
  }
  return null;
}

function findOperandEndingAt(idx) {
  if (idx < 0) return null;
  const t = state.tokens[idx];
  if (t.type === 'num' || t.type === 'const') return { start: idx, end: idx };
  if (t.type === 'rparen') {
    let depth = 1, j = idx - 1;
    while (j >= 0 && depth > 0) {
      if (state.tokens[j].type === 'rparen') depth++;
      else if (state.tokens[j].type === 'lparen') depth--;
      j--;
    }
    let start = j + 1;
    if (j >= 0 && state.tokens[j].type === 'func') start = j;
    return { start, end: idx };
  }
  return null;
}

// ---------- x^y / y√x ----------
function inputPower() {
  if (state.error) return;
  state.justEvaluated = false;
  const lt = lastToken();
  if (!lt || lt.type === 'op' || (lt.type === 'num' && lt.value === '-')) {
    if (state.result) {
      state.tokens.push({ type: 'num', value: String(state.result) });
    } else return;
  }
  state.tokens.push({ type: 'op', value: '^' });
  render();
}

function inputNthRoot() {
  if (state.error) return;
  state.justEvaluated = false;
  const lt = lastToken();
  if (!lt || lt.type === 'op' || (lt.type === 'num' && lt.value === '-')) {
    if (state.result) {
      state.tokens.push({ type: 'num', value: String(state.result) });
    } else return;
  }
  // y√x  =>  x^(1/y). 这里把当前表达式作为 y，用 root 运算符
  state.tokens.push({ type: 'op', value: 'root' });
  render();
}

// ---------- 退格 ----------
function backspace() {
  if (state.error) { clearAll(); return; }
  if (state.justEvaluated) { clearAll(); return; }
  if (state.tokens.length === 0) return;
  const lt = lastToken();
  if (isNumToken(lt) && lt.value.length > 1) {
    lt.value = lt.value.slice(0, -1);
  } else {
    state.tokens.pop();
    // 如果弹出的是 lparen，且前面是 func，把 func 也弹出
    const nl = lastToken();
    if (nl && nl.type === 'func') state.tokens.pop();
  }
  updateLiveResult();
  render();
}

// ---------- 清除 ----------
function clearAll() {
  state.tokens = [];
  state.result = 0;
  state.error = false;
  state.justEvaluated = false;
  render();
}

// ---------- 存储器 ----------
function memoryClear() { state.memory = 0; render(); }
function memoryAdd() {
  const v = currentDisplayValue();
  if (isFinite(v)) state.memory += v;
}
function memorySub() {
  const v = currentDisplayValue();
  if (isFinite(v)) state.memory -= v;
}
function memoryRecall() {
  if (state.error) clearAll();
  if (state.justEvaluated) { state.tokens = []; state.justEvaluated = false; }
  const lt = lastToken();
  if (lt && (lt.type === 'num' || lt.type === 'rparen' || lt.type === 'fact' || lt.type === 'pct' || lt.type === 'const')) {
    state.tokens.push({ type: 'op', value: '*' });
  }
  state.tokens.push({ type: 'num', value: String(state.memory) });
  updateLiveResult();
  render();
}
function currentDisplayValue() {
  if (state.error) return NaN;
  if (state.tokens.length === 0) return state.result;
  try { return evaluate(state.tokens); } catch (e) { return NaN; }
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
function evaluateNow() {
  if (state.tokens.length === 0) return;
  try {
    // 自动补全未闭合的括号
    const tokens = [...state.tokens];
    let depth = 0;
    for (const t of tokens) {
      if (t.type === 'lparen') depth++;
      else if (t.type === 'rparen') depth--;
    }
    while (depth > 0) { tokens.push({ type: 'rparen' }); depth--; }
    const val = evaluate(tokens);
    if (!isFinite(val)) throw new Error('math error');
    state.result = val;
    state.justEvaluated = true;
    state.error = false;
  } catch (e) {
    state.error = true;
  }
  render();
}

function updateLiveResult() {
  if (state.tokens.length === 0) { state.result = 0; return; }
  try {
    const tokens = [...state.tokens];
    let depth = 0;
    for (const t of tokens) {
      if (t.type === 'lparen') depth++;
      else if (t.type === 'rparen') depth--;
    }
    while (depth > 0) { tokens.push({ type: 'rparen' }); depth--; }
    const val = evaluate(tokens);
    if (isFinite(val)) state.result = val;
  } catch (e) { /* 忽略实时计算错误 */ }
}

// ===== 表达式求值 (shunting-yard + RPN) =====
function evaluate(tokens) {
  const rpn = toRPN(tokens);
  return evalRPN(rpn);
}

function toRPN(tokens) {
  const out = [];
  const ops = [];
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3, 'root': 3 };
  const rightAssoc = { '^': true, 'root': true };
  const funcs = new Set(['sin','cos','tan','asin','acos','atan','ln','log','sqrt','cbrt','exp','pow10']);

  let prev = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'num') {
      out.push(t);
    } else if (t.type === 'const') {
      out.push(t);
    } else if (t.type === 'func') {
      ops.push(t);
    } else if (t.type === 'lparen') {
      ops.push(t);
    } else if (t.type === 'rparen') {
      while (ops.length && ops[ops.length-1].type !== 'lparen') {
        out.push(ops.pop());
      }
      if (!ops.length) throw new Error('paren mismatch');
      ops.pop(); // pop (
      if (ops.length && ops[ops.length-1].type === 'func') {
        out.push(ops.pop());
      }
    } else if (t.type === 'op') {
      const o1 = t.value;
      while (ops.length) {
        const top = ops[ops.length-1];
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
    } else if (t.type === 'fact') {
      out.push(t);
    } else if (t.type === 'pct') {
      out.push(t);
    }
    prev = t;
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
          // a root b => a^(1/b)  (a 为被开方数，b 为根指数)
          if (b === 0) throw new Error('root index zero');
          let rv;
          if (a < 0 && Number.isInteger(b) && Math.abs(b) % 2 === 1) {
            rv = -Math.pow(-a, 1 / b);
          } else {
            rv = Math.pow(a, 1 / b);
          }
          stack.push(rv);
          break;
        }
      }
    } else if (t.type === 'func') {
      const x = stack.pop();
      const deg = state.angleMode === 'Deg';
      switch (t.value) {
        case 'sin': stack.push(Math.sin(deg ? x * Math.PI/180 : x)); break;
        case 'cos': stack.push(Math.cos(deg ? x * Math.PI/180 : x)); break;
        case 'tan': stack.push(Math.tan(deg ? x * Math.PI/180 : x)); break;
        case 'asin': { const v = Math.asin(x); stack.push(deg ? v*180/Math.PI : v); break; }
        case 'acos': { const v = Math.acos(x); stack.push(deg ? v*180/Math.PI : v); break; }
        case 'atan': { const v = Math.atan(x); stack.push(deg ? v*180/Math.PI : v); break; }
        case 'ln': stack.push(Math.log(x)); break;
        case 'log': stack.push(Math.log10(x)); break;
        case 'sqrt': stack.push(Math.sqrt(x)); break;
        case 'cbrt': stack.push(Math.cbrt(x)); break;
        case 'exp': stack.push(Math.exp(x)); break;
        case 'pow10': stack.push(Math.pow(10, x)); break;
      }
    } else if (t.type === 'fact') {
      const x = stack.pop();
      stack.push(factorial(x));
    } else if (t.type === 'pct') {
      const x = stack.pop();
      stack.push(x / 100);
    }
  }
  if (stack.length !== 1) throw new Error('bad expr');
  return stack[0];
}

function factorial(n) {
  if (n < 0 || !Number.isInteger(n)) {
    // 用伽马函数近似非整数阶乘
    return gamma(n + 1);
  }
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// Lanczos 伽马近似
function gamma(z) {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// ===== 按钮定义与渲染 =====
const buttons = [
  // label, action, class, span
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
buttons.forEach(b => {
  const btn = document.createElement('button');
  btn.className = 'btn ' + (b.c || '');
  if (b.span) btn.classList.add('equals');
  if (b.id) btn.id = b.id;
  // 处理上下标显示
  if (b.l === 'x²') btn.innerHTML = 'x<sup>2</sup>';
  else if (b.l === 'x³') btn.innerHTML = 'x<sup>3</sup>';
  else if (b.l === 'xʸ') btn.innerHTML = 'x<sup>y</sup>';
  else if (b.l === 'ʸ√x') btn.innerHTML = '<sup>y</sup>√x';
  else if (b.l === '1/x') btn.innerHTML = '1/x';
  else btn.textContent = b.l;
  btn.addEventListener('click', b.a);
  keypad.appendChild(btn);
});

// Inv / 角度模式按钮高亮
function updateToggleButtons() {
  const inv = $('btnInv');
  const ang = $('btnAngle');
  if (inv) inv.classList.toggle('active', state.inv);
  if (ang) {
    ang.textContent = state.angleMode === 'Deg' ? 'Rad' : 'Deg';
    ang.classList.toggle('active', state.angleMode === 'Rad');
  }
}
const _origRender = render;
render = function() { _origRender(); updateToggleButtons(); };

// 键盘支持
document.addEventListener('keydown', (e) => {
  const k = e.key;
  if (/[0-9]/.test(k)) inputDigit(k);
  else if (k === '.') inputDot();
  else if (k === '+') inputOp('+');
  else if (k === '-') inputOp('-');
  else if (k === '*') inputOp('*');
  else if (k === '/') { e.preventDefault(); inputOp('/'); }
  else if (k === '(') inputParen('(');
  else if (k === ')') inputParen(')');
  else if (k === '^') inputPower();
  else if (k === '%') appendPostfix('pct');
  else if (k === '!' ) appendPostfix('fact');
  else if (k === 'Enter' || k === '=') { e.preventDefault(); evaluateNow(); }
  else if (k === 'Backspace') backspace();
  else if (k === 'Escape') clearAll();
});

render();
