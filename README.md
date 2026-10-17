# 科学计算器

一个功能完整的科学计算器，提供 **Windows 桌面版 (.exe)** 和 **Android 手机版 (.apk)** 两个平台的程序，界面与功能对齐 Google 计算器。

## 功能

**基础运算**
- 数字 0-9、小数点、四则运算（+ − × ÷）、等号、括号 `( )`
- 清除 `C`、退格 `⌫`
- 百分比 `%`

**科学运算**
- 平方 `x²`、立方 `x³`、任意次幂 `xʸ`、任意次方根 `ʸ√x`
- 阶乘 `x!`、平方根 `√`、倒数 `1/x`
- 自然常数 `e`、圆周率 `π`
- 自然对数 `ln`、常用对数 `log`
- 三角函数 `sin` / `cos` / `tan`

**模式与存储**
- `Inv` 反函数模式（切换为 `asin` / `acos` / `atan`、`eˣ`、`10ˣ`）
- `Deg` / `Rad` 角度单位切换
- 存储器 `MC` / `M+` / `M−` / `MR`

## 按键布局

```
(    )   1/x   MC   M+   M-   MR
x²   x³   xʸ   C    ÷    ×    ⌫
x!   √    ʸ√x   7    8    9    −
e    ln   log   4    5    6    +
sin  cos  tan   1    2    3    =
Inv  Rad  π     %    0    .    =
```

## 目录结构

```
calculator-app/
├── web/                 # 计算器核心（HTML/CSS/JavaScript，两端共用）
│   ├── index.html
│   └── app.js           # 表达式解析与求值（调度场算法 + RPN）
├── electron/            # Windows 桌面版（Electron）
│   ├── main.js
│   └── package.json
└── android/             # Android 手机版（WebView + Gradle）
    └── app/src/main/
        ├── java/com/calculator/MainActivity.java
        ├── assets/      # 内嵌的 web 页面
        └── AndroidManifest.xml
```

## 运行与打包

**Windows (.exe)**
```bash
cd electron
npm install
npm run build      # 生成 dist/ScientificCalculator 1.0.0.exe（便携版，免安装）
```

**Android (.apk)**
```bash
cd android
gradle assembleDebug   # 生成 app/build/outputs/apk/debug/app-debug.apk
```

## 说明

- 表达式求值采用调度场算法转换为逆波兰式（RPN）后计算，支持括号嵌套、隐式乘法、一元负号。
- 非整数阶乘使用 Lanczos 伽马函数近似。
- 角度模式影响三角与反三角函数：`Deg` 制下 `sin(30)=0.5`，`Rad` 制下按弧度计算。
- Android 版本最低支持 Android 5.0（API 21）。
