# Wolfram Shortener

VS Code extension that shortens Wolfram Language files on save.

## Supported file types

- `.wl`
- `.m`
- `.nb`

## Behavior

On save, the extension reads the full file, passes it through `shorten()` in `transformer.js`, replaces the document content, and shows a status bar message with the number of characters saved.

## Development

1. Open this folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Open a `.wl`, `.m`, or `.nb` file and save to trigger the extension.
