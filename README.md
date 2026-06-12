# WolframShrink

WolframShrink is a VS Code extension that rewrites Wolfram Language code into shorter forms. It shortens supported patterns automatically when you save a file, and it also provides a manual command to shrink the current file on demand.

## What it does

When you save a `.wl`, `.m`, or `.nb` file, the extension scans the content and rewrites only the patterns that become shorter. A permanent status bar item stays visible in the bottom-right corner so you can see the last save result at a glance.

## Transformations

### Postfix form

Before:

```wolfram
f[x]
```

After:

```wolfram
x // f
```

### Map operator

Before:

```wolfram
Map[Sqrt, {1, 2, 3}]
```

After:

```wolfram
Sqrt /@ {1, 2, 3}
```

### Apply operator

Before:

```wolfram
Apply[Plus, {1, 2, 3}]
```

After:

```wolfram
Plus @@ {1, 2, 3}
```

### Logical operators

Before:

```wolfram
Not[x]
```

After:

```wolfram
!x
```

Before:

```wolfram
And[a, b, c]
```

After:

```wolfram
a && b && c
```

Before:

```wolfram
Or[x, y]
```

After:

```wolfram
x || y
```

### Part notation

Before:

```wolfram
Part[myList, 3]
```

After:

```wolfram
myList[[3]]
```

## Installation

### From source

1. Open this folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Open a supported Wolfram file and save it, or run the manual command from the Command Palette.

### From a VSIX package

1. Package the extension into a `.vsix` file.
2. In VS Code, open the Extensions view.
3. Choose **Install from VSIX...** and select the package.

## Settings

The following settings are available under `wolframShortener`.

- `wolframShortener.enablePostfix`
- `wolframShortener.enableMapOperator`
- `wolframShortener.enableApplyOperator`
- `wolframShortener.enableLogicalOperators`
- `wolframShortener.enablePartNotation`

All settings default to `true`. Disable any of them to skip that transformation category.

## Keyboard shortcuts

- `Ctrl+S` saves a supported file and runs WolframShrink automatically.
- `Ctrl+Shift+P` opens the Command Palette, where you can run `WolframShrink: Shorten This File`.
- You can bind your own shortcut to `wolfram-shortener.shortenFile` if you want a dedicated keybinding.

## Manual command

Use `WolframShrink: Shorten This File` to shorten the active Wolfram file immediately, without saving first. The command is registered as `wolfram-shortener.shortenFile`.

## Supported file types

- `.wl`
- `.m`
- `.nb`
