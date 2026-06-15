# Wshrink 🔥

A VS Code extension that automatically shortens Wolfram Language code on save — without changing the logic.

Just like Prettier formats JavaScript, Wshrink optimizes your Wolfram code using the language's own built-in shorthand operators. Write verbose, readable code — save the file — get clean, idiomatic Wolfram.

---

## Features

- ⚡ **Auto-shortens on save** — works automatically every time you hit `Ctrl+S`
- 🧠 **Logic-preserving** — only changes how code is written, never what it does
- 🛡️ **Safe** — never touches strings, comments, or function definitions
- 📊 **Status bar** — shows how many characters were saved after every save
- 🎛️ **Configurable** — toggle each transformation on or off in settings
- 🖊️ **Manual command** — run it from the Command Palette anytime

---

## Supported File Types

`.wl` `.m` `.nb`

---

## Transformations

### 1. Postfix Operator `//`

```wolfram
(* Before *)
Print[Range[10]]

(* After *)
Range[10] // Print
```

### 2. Map Operator `/@`

```wolfram
(* Before *)
Map[Sqrt, {1, 4, 9, 16}]

(* After *)
Sqrt /@ {1, 4, 9, 16}
```

### 3. Apply Operator `@@`

```wolfram
(* Before *)
Apply[Plus, {1, 2, 3, 4, 5}]

(* After *)
Plus @@ {1, 2, 3, 4, 5}
```

### 4. Logical Operators

```wolfram
(* Before *)
Not[x]
And[a, b, c]
Or[x, y]

(* After *)
!x
a && b && c
x || y
```

### 5. Part Notation

```wolfram
(* Before *)
Part[myList, 3]
Part[myList, -1]

(* After *)
myList[[3]]
myList[[-1]]
```

### 6. Nested Transformations

```wolfram
(* Before *)
Print[Map[Sqrt, Apply[Plus, {1,2,3}]]]

(* After *)
Plus @@ {1,2,3} // Sqrt /@ // Print
```

---

## What It Does NOT Touch

```wolfram
(* Comments are never modified *)
(* Map[f, list] stays exactly as is inside a comment *)

(* Strings are never modified *)
x = "Map[f, list]"
y = "Not[True]"

(* Left hand side of definitions is never touched *)
f[x_] := Print[x]
g[x_, y_] := Map[Sqrt, {x, y}]

(* Hold variants are never transformed inside *)
Hold[Print[Range[10]]]
HoldAll[Map[Sqrt, {1,4,9}]]

(* 3-argument Map and Apply are left alone *)
Map[f, {1,2,3}, {2}]
Apply[Plus, {1,2,3}, {0,1}]

(* Already shortened code is not touched again *)
Range[10] // Print
Sqrt /@ {1, 4, 9}
```

---

## Installation

### From Source
1. Open this folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Open any of the Wolfram Files (Files ending with .wl) and save it.

<!-- ### From VS Code Marketplace -->
<!-- 1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for `Wshrink`
4. Click Install -->

<!-- ### From VSIX file
1. Download the `.vsix` file from the releases page
2. Open VS Code
3. Go to Extensions (`Ctrl+Shift+X`)
4. Click the `...` menu → `Install from VSIX`
5. Select the downloaded file -->

---

## Settings

Go to `File → Preferences → Settings` and search for `Wshrink` to configure:

| Setting | Default | Description |
|---|---|---|
| `wshrink.enablePostfix` | `true` | Convert `f[expr]` to `expr // f` |
| `wshrink.enableMapOperator` | `true` | Convert `Map[f, list]` to `f /@ list` |
| `wshrink.enableApplyOperator` | `true` | Convert `Apply[f, list]` to `f @@ list` |
| `wshrink.enableLogicalOperators` | `true` | Convert `Not/And/Or` to `!/&&/\|\|` |
| `wshrink.enablePartNotation` | `true` | Convert `Part[expr, i]` to `expr[[i]]` |

---

## How It Works

The extension hooks into VS Code's `onWillSaveTextDocument` event — the same approach used by Prettier and other formatters. When you save a Wolfram file:

1. The full file content is read
2. Safe zones (strings, comments) are identified and locked
3. Transformations are applied repeatedly in passes until no more changes occur
4. The file is updated with the shortened version before hitting disk
5. The status bar shows how many characters were saved

The transformation engine uses character-by-character bracket matching instead of regex — this makes it reliable for nested and complex expressions.

---

## Built With

- JavaScript
- VS Code Extension API
- Zero external dependencies

---