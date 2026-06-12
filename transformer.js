const BRACKET_CLOSE = { '[': ']', '(': ')', '{': '}' };

const DEDICATED_SYMBOLS = new Set(['Map', 'Apply', 'Not', 'And', 'Or', 'Part']);

/**
 * @param {string} code
 * @param {number} pos
 * @returns {boolean}
 */
function isInsideString(code, pos) {
	let inString = false;
	let commentDepth = 0;

	for (let i = 0; i < pos; i++) {
		if (commentDepth > 0) {
			if (code.startsWith('(*', i)) {
				commentDepth++;
				i++;
			} else if (code.startsWith('*)', i)) {
				commentDepth--;
				i++;
			}
			continue;
		}

		if (inString) {
			if (code[i] === '\\') {
				i++;
				continue;
			}
			if (code[i] === '"') {
				inString = false;
			}
			continue;
		}

		if (code.startsWith('(*', i)) {
			commentDepth = 1;
			i++;
			continue;
		}

		if (code[i] === '"') {
			inString = true;
		}
	}

	return inString;
}

/**
 * @param {string} code
 * @param {number} pos
 * @returns {boolean}
 */
function isInsideComment(code, pos) {
	let inString = false;
	let commentDepth = 0;

	for (let i = 0; i < pos; i++) {
		if (commentDepth > 0) {
			if (code.startsWith('(*', i)) {
				commentDepth++;
				i++;
			} else if (code.startsWith('*)', i)) {
				commentDepth--;
				i++;
			}
			continue;
		}

		if (inString) {
			if (code[i] === '\\') {
				i++;
				continue;
			}
			if (code[i] === '"') {
				inString = false;
			}
			continue;
		}

		if (code.startsWith('(*', i)) {
			commentDepth = 1;
			i++;
			continue;
		}

		if (code[i] === '"') {
			inString = true;
		}
	}

	return commentDepth > 0;
}

/**
 * @param {string} code
 * @param {number} openPos
 * @returns {number}
 */
function findMatchingClose(code, openPos) {
	const openChar = code[openPos];
	const closeChar = BRACKET_CLOSE[openChar];
	if (!closeChar) {
		return -1;
	}

	let depth = 1;
	let inString = false;
	let commentDepth = 0;

	for (let i = openPos + 1; i < code.length; i++) {
		if (commentDepth > 0) {
			if (code.startsWith('(*', i)) {
				commentDepth++;
				i++;
			} else if (code.startsWith('*)', i)) {
				commentDepth--;
				i++;
			}
			continue;
		}

		if (inString) {
			if (code[i] === '\\') {
				i++;
				continue;
			}
			if (code[i] === '"') {
				inString = false;
			}
			continue;
		}

		if (code.startsWith('(*', i)) {
			commentDepth = 1;
			i++;
			continue;
		}

		if (code[i] === '"') {
			inString = true;
			continue;
		}

		if (code[i] === openChar) {
			depth++;
		} else if (code[i] === closeChar) {
			depth--;
			if (depth === 0) {
				return i;
			}
		}
	}

	return -1;
}

/**
 * @param {string} argsStr
 * @returns {string[]}
 */
function splitTopLevelArgs(argsStr) {
	const args = [];
	let current = '';
	let bracketDepth = 0;
	let inString = false;
	let commentDepth = 0;

	for (let i = 0; i < argsStr.length; i++) {
		if (commentDepth > 0) {
			current += argsStr[i];
			if (argsStr.startsWith('(*', i)) {
				commentDepth++;
				current += argsStr[i + 1];
				i++;
			} else if (argsStr.startsWith('*)', i)) {
				commentDepth--;
				current += argsStr[i + 1];
				i++;
			}
			continue;
		}

		if (inString) {
			current += argsStr[i];
			if (argsStr[i] === '\\') {
				if (i + 1 < argsStr.length) {
					current += argsStr[i + 1];
					i++;
				}
			} else if (argsStr[i] === '"') {
				inString = false;
			}
			continue;
		}

		if (argsStr.startsWith('(*', i)) {
			commentDepth = 1;
			current += '(*';
			i++;
			continue;
		}

		if (argsStr[i] === '"') {
			inString = true;
			current += argsStr[i];
			continue;
		}

		const ch = argsStr[i];
		if (ch === '[' || ch === '(' || ch === '{') {
			bracketDepth++;
		} else if (ch === ']' || ch === ')' || ch === '}') {
			bracketDepth--;
		} else if (ch === ',' && bracketDepth === 0) {
			args.push(current);
			current = '';
			continue;
		}

		current += ch;
	}

	args.push(current);
	return args;
}

/**
 * @param {string} name
 * @returns {string}
 */
function baseSymbolName(name) {
	const idx = name.lastIndexOf('`');
	return idx >= 0 ? name.slice(idx + 1) : name;
}

/**
 * @param {string} code
 * @param {number} bracketPos
 * @returns {string | null}
 */
function getSymbolNameBefore(code, bracketPos) {
	let i = bracketPos - 1;
	while (i >= 0 && (code[i] === ' ' || code[i] === '\t')) {
		i--;
	}
	if (i < 0) {
		return null;
	}

	const end = i + 1;

	if (code[i] === '`') {
		let j = i - 1;
		while (j >= 0) {
			if (code[j] === '`') {
				let k = j - 1;
				while (k >= 0 && /[a-zA-Z0-9$]/.test(code[k])) {
					k--;
				}
				if (k < j - 1 && k >= 0 && code[k] === '`') {
					let ctxStart = k;
					while (ctxStart > 0 && /[a-zA-Z0-9$]/.test(code[ctxStart - 1])) {
						ctxStart--;
					}
					return code.slice(ctxStart, end);
				}
				return code.slice(j, end);
			}
			j--;
		}
		return null;
	}

	if (!/[a-zA-Z$]/.test(code[i])) {
		return null;
	}

	let start = i;
	while (start >= 0) {
		const ch = code[start];
		if (/[a-zA-Z0-9$]/.test(ch)) {
			start--;
		} else if (ch === '`') {
			start--;
			while (start >= 0 && /[a-zA-Z0-9$]/.test(code[start])) {
				start--;
			}
			break;
		} else {
			break;
		}
	}

	return code.slice(start + 1, end);
}

/**
 * @param {string} expr
 * @param {string} op
 * @returns {boolean}
 */
function hasTopLevelOperator(expr, op) {
	let bracketDepth = 0;
	let inString = false;
	let commentDepth = 0;

	for (let i = 0; i < expr.length; i++) {
		if (commentDepth > 0) {
			if (expr.startsWith('(*', i)) {
				commentDepth++;
				i++;
			} else if (expr.startsWith('*)', i)) {
				commentDepth--;
				i++;
			}
			continue;
		}

		if (inString) {
			if (expr[i] === '\\') {
				i++;
				continue;
			}
			if (expr[i] === '"') {
				inString = false;
			}
			continue;
		}

		if (expr.startsWith('(*', i)) {
			commentDepth = 1;
			i++;
			continue;
		}

		if (expr[i] === '"') {
			inString = true;
			continue;
		}

		const ch = expr[i];
		if (ch === '[' || ch === '(' || ch === '{') {
			bracketDepth++;
		} else if (ch === ']' || ch === ')' || ch === '}') {
			bracketDepth--;
		} else if (bracketDepth === 0) {
			if (op === '//' && expr.startsWith('//', i)) {
				return true;
			}
			if (op === ';' && ch === ';') {
				return true;
			}
		}
	}

	return false;
}

/**
 * @param {string} code
 * @returns {{ start: number, end: number, name: string, args: string[], argsStr: string }[]}
 */
function findBracketCalls(code) {
	const calls = [];

	for (let i = 0; i < code.length; i++) {
		if (isInsideString(code, i) || isInsideComment(code, i)) {
			continue;
		}
		if (code[i] !== '[') {
			continue;
		}

		const name = getSymbolNameBefore(code, i);
		if (!name) {
			continue;
		}

		const closePos = findMatchingClose(code, i);
		if (closePos === -1) {
			continue;
		}

		const nameStart = i - name.length;
		const argsStr = code.slice(i + 1, closePos);
		calls.push({
			start: nameStart,
			end: closePos + 1,
			name,
			args: splitTopLevelArgs(argsStr),
			argsStr
		});
	}

	return calls;
}

/**
 * @param {string} code
 * @param {{ start: number, end: number, replacement: string }[]} replacements
 * @returns {string}
 */
function applyReplacements(code, replacements) {
	replacements.sort((a, b) => b.start - a.start);
	let result = code;
	for (const { start, end, replacement } of replacements) {
		result = result.slice(0, start) + replacement + result.slice(end);
	}
	return result;
}

/**
 * @param {string} code
 * @returns {string}
 */
function transformPostfix(code) {
	const replacements = [];

	for (const call of findBracketCalls(code)) {
		const baseName = baseSymbolName(call.name);
		if (DEDICATED_SYMBOLS.has(baseName)) {
			continue;
		}

		if (call.args.length !== 1) {
			continue;
		}

		const expression = call.args[0].trim();
		const functionName = call.name;

		if (expression.length <= functionName.length) {
			continue;
		}

		let outputExpr = expression;
		if (hasTopLevelOperator(expression, '//') || hasTopLevelOperator(expression, ';')) {
			outputExpr = `(${expression})`;
		}

		const replacement = `${outputExpr} // ${functionName}`;
		const original = code.slice(call.start, call.end);

		if (replacement.length < original.length) {
			replacements.push({
				start: call.start,
				end: call.end,
				replacement
			});
		}
	}

	return applyReplacements(code, replacements);
}

/**
 * @param {string} code
 * @param {string} symbol
 * @param {string} operator
 * @returns {string}
 */
function transformBinaryOperator(code, symbol, operator) {
	const replacements = [];

	for (const call of findBracketCalls(code)) {
		if (baseSymbolName(call.name) !== symbol) {
			continue;
		}
		if (call.args.length !== 2) {
			continue;
		}

		const left = call.args[0].trim();
		const right = call.args[1].trim();
		const replacement = `${left} ${operator} ${right}`;
		const original = code.slice(call.start, call.end);

		if (replacement.length < original.length) {
			replacements.push({
				start: call.start,
				end: call.end,
				replacement
			});
		}
	}

	return applyReplacements(code, replacements);
}

/**
 * @param {string} code
 * @returns {string}
 */
function transformMap(code) {
	return transformBinaryOperator(code, 'Map', '/@');
}

/**
 * @param {string} code
 * @returns {string}
 */
function transformApply(code) {
	return transformBinaryOperator(code, 'Apply', '@@');
}

/**
 * @param {string} code
 * @returns {string}
 */
function transformLogical(code) {
	const replacements = [];

	for (const call of findBracketCalls(code)) {
		const baseName = baseSymbolName(call.name);
		let replacement = null;

		if (baseName === 'Not' && call.args.length === 1) {
			replacement = `!${call.args[0].trim()}`;
		} else if (baseName === 'And' && call.args.length >= 1) {
			replacement = call.args.map((arg) => arg.trim()).join(' && ');
		} else if (baseName === 'Or' && call.args.length >= 1) {
			replacement = call.args.map((arg) => arg.trim()).join(' || ');
		}

		if (!replacement) {
			continue;
		}

		const original = code.slice(call.start, call.end);
		if (replacement.length < original.length) {
			replacements.push({
				start: call.start,
				end: call.end,
				replacement
			});
		}
	}

	return applyReplacements(code, replacements);
}

/**
 * @param {string} code
 * @returns {string}
 */
function transformPart(code) {
	const replacements = [];

	for (const call of findBracketCalls(code)) {
		if (baseSymbolName(call.name) !== 'Part') {
			continue;
		}
		if (call.args.length !== 2) {
			continue;
		}

		const expr = call.args[0].trim();
		const index = call.args[1].trim();
		const replacement = `${expr}[[${index}]]`;
		const original = code.slice(call.start, call.end);

		if (replacement.length < original.length) {
			replacements.push({
				start: call.start,
				end: call.end,
				replacement
			});
		}
	}

	return applyReplacements(code, replacements);
}

const TRANSFORMS = [
	transformPostfix,
	transformMap,
	transformApply,
	transformLogical,
	transformPart
];

/**
 * @param {string} text
 * @returns {string}
 */
function shorten(text) {
	let result = text;
	let changed = true;

	while (changed) {
		changed = false;
		for (const transform of TRANSFORMS) {
			const next = transform(result);
			if (next !== result) {
				result = next;
				changed = true;
			}
		}
	}

	return result;
}

module.exports = { shorten };
