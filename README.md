# 科学计算器 · Scientific Calculator

一个功能完整的科学计算器，提供 **Windows 桌面版 (.exe)** 和 **Android 手机版 (.apk)** 两个平台的程序，界面与功能对齐 Google 计算器。

A full-featured scientific calculator available for both **Windows desktop (.exe)** and **Android (.apk)**, with a look & feel aligned with the Google Calculator.

## 功能 · Features

**基础运算 · Basic**
- 数字 0-9、小数点、四则运算（+ − × ÷）、等号、括号 `( )` / Digits 0-9, decimal point, arithmetic (+ − × ÷), equals, parentheses
- 清除 `C`、退格 `⌫` / Clear `C`, backspace `⌫`
- 百分比 `%` / Percentage `%`

**科学运算 · Scientific**
- 平方 `x²`、立方 `x³`、任意次幂 `xʸ`、任意次方根 `ʸ√x` / Square `x²`, cube `x³`, power `xʸ`, nth root `ʸ√x`
- 阶乘 `x!`、平方根 `√`、倒数 `1/x` / Factorial `x!`, square root `√`, reciprocal `1/x`
- 自然常数 `e`、圆周率 `π` / Constants `e` and `π`
- 自然对数 `ln`、常用对数 `log` / Natural log `ln`, common log `log`
- 三角函数 `sin` / `cos` / `tan` / Trigonometric functions

**模式与存储 · Modes & Memory**
- `Inv` 反函数模式（切换为 `asin` / `acos` / `atan`、`eˣ`、`10ˣ`）/ `Inv` inverse mode (`asin` / `acos` / `atan`, `eˣ`, `10ˣ`)
- `Deg` / `Rad` 角度单位切换 / Degree / Radian toggle
- 存储器 `MC` / `M+` / `M−` / `MR` / Memory keys

**v3.0 新特性 · What's New in v3.0**
- 结果只在按下 `=` 后显示，输入过程只显示表达式，任何按键都不会提前显示答案 / The result is shown only after pressing `=`; while typing, only the expression is displayed — no key press reveals the answer early
- 电脑端完整键盘支持（数字、运算符、括号、`Enter`/`=`、退格、清除、模式切换）/ Full keyboard support on desktop (digits, operators, parentheses, `Enter`/`=`, backspace, clear, mode toggles)
- 右上角「关于」弹窗 / "About" dialog in the top-right corner
  - 刘宸至一首创作！
  - A creation by Liu Chenzhi!

## 按键布局 · Key Layout

```
(    )   1/x   MC   M+   M-   MR
x²   x³   xʸ   C    ÷    ×    ⌫
x!   √    ʸ√x  7    8    9    −
e    ln   log   4    5    6    +
sin  cos  tan   1    2    3    =
Inv  Rad  π     %    0    .    =
```

## 目录结构 · Project Structure

```
calculator-app/
├── web/                 # 计算器核心（HTML/CSS/JavaScript，两端共用）
│                        # Calculator core (HTML/CSS/JavaScript, shared by both platforms)
│   ├── index.html
│   └── app.js           # 表达式解析与求值（调度场算法 + RPN）
│                        # Expression parsing & evaluation (shunting-yard + RPN)
├── electron/            # Windows 桌面版（Electron）/ Windows desktop (Electron)
│   ├── main.js
│   └── package.json
└── android/             # Android 手机版（WebView + Gradle）
                         # Android app (WebView + Gradle)
    └── app/src/main/
        ├── java/com/calculator/MainActivity.java
        ├── assets/      # 内嵌的 web 页面 / Bundled web pages
        └── AndroidManifest.xml
```

## 运行与打包 · Build & Run

**Windows (.exe)**
```bash
cd electron
npm install
npm run build      # 生成 dist/ScientificCalculator-<version>-windows.exe（便携版，免安装）
                    # Produces a portable, no-install single-file .exe
```

**Android (.apk)**
```bash
cd android
gradle assembleDebug   # 生成 app/build/outputs/apk/debug/app-debug.apk
```

## 说明 · Notes

- 表达式求值采用调度场算法转换为逆波兰式（RPN）后计算，支持括号嵌套、隐式乘法、一元负号。/ Expressions are converted to RPN via the shunting-yard algorithm before evaluation; supports nested parentheses, implicit multiplication and unary minus.
- 非整数阶乘使用 Lanczos 伽马函数近似。/ Non-integer factorials are approximated with the Lanczos gamma function.
- 角度模式影响三角与反三角函数：`Deg` 制下 `sin(30)=0.5`，`Rad` 制下按弧度计算。/ The angle mode affects trig and inverse-trig functions: `sin(30)=0.5` in `Deg`, radians in `Rad`.
- Android 版本最低支持 Android 5.0（API 21）。/ Android 5.0 (API 21) or later.
