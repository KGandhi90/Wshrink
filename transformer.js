let vscode;

try {
	vscode = require('vscode');
} catch {
	vscode = null;
}

const BRACKET_CLOSE = { '[': ']', '(': ')', '{': '}' };

const DEDICATED_SYMBOLS = new Set(['Map', 'Apply', 'Not', 'And', 'Or', 'Part']);
const PROTECTED_SYMBOLS = new Set([
	'Hold',
	'HoldFirst',
	'HoldRest',
	'HoldAll',
	'HoldComplete',
	'HoldPattern',
	'HoldForm',
	'Unevaluated',
	'Inactive'
]);

const DEFAULT_SETTINGS = {
	enablePostfix: true,
	enableMapOperator: true,
	enableApplyOperator: true,
	enableLogicalOperators: true,
	enablePartNotation: true
};

const SHORT_OPERATORS = ['/@', '@@'];
const TRAILING_COMMENT_TOKEN_PREFIX = '__WOLFRAM_SHORTENER_COMMENT_';
const ASSIGNMENT_TOKEN_PREFIX = '__WOLFRAM_SHORTENER_ASSIGNMENT_';

/**
 * @param {string} text
 * @returns {[number, number][]}
 */
function extractSafeZones(text) {
	const zones = [];
	let i = 0;

	while (i < text.length) {
		if (text[i] === '"') {
			const start = i;
			i++;
			while (i < text.length) {
				if (text[i] === '\\') {
					i += 2;
					continue;
				}
				if (text[i] === '"') {
					i++;
					break;
				}
				i++;
			}
			zones.push([start, i]);
			continue;
		}

		if (text.startsWith('(*', i)) {
			const start = i;
			let depth = 1;
			i += 2;
			while (i < text.length && depth > 0) {
				if (text.startsWith('(*', i)) {
					depth++;
					i += 2;
				} else if (text.startsWith('*)', i)) {
					depth--;
					i += 2;
				} else {
					i++;
				}
			}
			zones.push([start, i]);
			continue;
		}

		i++;
	}

	return zones;
}

/**
 * @param {number} pos
 * @param {[number, number][]} safeZones
 * @returns {boolean}
 */
function isInSafeZone(pos, safeZones) {
	for (const [start, end] of safeZones) {
		if (pos >= start && pos < end) {
			return true;
		}
	}
	return false;
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isProtectedSymbol(name) {
	return PROTECTED_SYMBOLS.has(baseSymbolName(name));
}

/**
 * @param {string} code
 * @returns {{ start: number, end: number }[]}
 */
function findProtectedCallRanges(code) {
	const safeZones = extractSafeZones(code);
	return findBracketCalls(code, safeZones)
		.filter((call) => isProtectedSymbol(call.name))
		.map((call) => ({ start: call.start, end: call.end }));
}

/**
 * @param {number} start
 * @param {number} end
 * @param {{ start: number, end: number }[]} ranges
 * @returns {boolean}
 */
function isRangeInsideAny(start, end, ranges) {
	return ranges.some((range) => start >= range.start && end <= range.end);
}

/**
 * @param {string} line
 * @returns {{ index: number, length: number } | null}
 */
function findTopLevelAssignmentOperator(line) {
	let bracketDepth = 0;
	let inString = false;
	let commentDepth = 0;

	for (let i = 0; i < line.length; i++) {
		if (commentDepth > 0) {
			if (line.startsWith('(*', i)) {
				commentDepth++;
				i++;
			} else if (line.startsWith('*)', i)) {
				commentDepth--;
				i++;
			}
			continue;
		}

		if (inString) {
			if (line[i] === '\\') {
				i++;
				continue;
			}
			if (line[i] === '"') {
				inString = false;
			}
			continue;
		}

		if (line.startsWith('(*', i)) {
			commentDepth = 1;
			i++;
			continue;
		}

		if (line[i] === '"') {
			inString = true;
			continue;
		}

		const ch = line[i];
		if (ch === '[' || ch === '(' || ch === '{') {
			bracketDepth++;
			continue;
		}
		if (ch === ']' || ch === ')' || ch === '}') {
			bracketDepth--;
			continue;
		}

		if (bracketDepth !== 0) {
			continue;
		}

		if (line.startsWith(':=', i)) {
			return { index: i, length: 2 };
		}

		if (ch === '=') {
			const prev = i > 0 ? line[i - 1] : '';
			const next = i + 1 < line.length ? line[i + 1] : '';
			if (prev !== '=' && prev !== '<' && prev !== '>' && prev !== '!' && next !== '=') {
				return { index: i, length: 1 };
			}
		}
	}

	return null;
}

/**
 * @param {string} text
 * @returns {{ text: string, assignments: { token: string, lhs: string }[] }}
 */
function maskAssignmentLeftSides(text) {
	const lines = text.split(/(\r?\n)/);
	const assignments = [];
	let assignmentIndex = 0;
	let result = '';

	for (let i = 0; i < lines.length; i += 2) {
		const line = lines[i] ?? '';
		const lineEnding = lines[i + 1] ?? '';
		const assignment = findTopLevelAssignmentOperator(line);

		if (assignment) {
			const token = `${ASSIGNMENT_TOKEN_PREFIX}${assignmentIndex}__`;
			assignments.push({ token, lhs: line.slice(0, assignment.index) });
			result += `${token}${line.slice(assignment.index)}` + lineEnding;
			assignmentIndex++;
			continue;
		}

		result += line + lineEnding;
	}

	return { text: result, assignments };
}

/**
 * @param {string} text
 * @param {{ token: string, lhs: string }[]} assignments
 * @returns {string}
 */
function restoreAssignmentLeftSides(text, assignments) {
	let result = text;
	for (const assignment of assignments) {
		result = result.replaceAll(assignment.token, assignment.lhs);
	}
	return result;
}

/**
 * @param {number} start
 * @param {number} end
 * @param {[number, number][]} safeZones
 * @returns {boolean}
 */
function rangeOverlapsSafeZone(start, end, safeZones) {
	return isInSafeZone(start, safeZones) || isInSafeZone(end - 1, safeZones);
}

/**
 * @param {string} code
 * @param {number} pos
 * @returns {boolean}
 */
function isInsideString(code, pos) {
	for (const [start, end] of extractSafeZones(code)) {
		if (code[start] === '"' && pos >= start && pos < end) {
			return true;
		}
	}
	return false;
}

/**
 * @param {string} code
 * @param {number} pos
 * @returns {boolean}
 */
function isInsideComment(code, pos) {
	for (const [start, end] of extractSafeZones(code)) {
		if (code.startsWith('(*', start) && pos >= start && pos < end) {
			return true;
		}
	}
	return false;
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

		if (argsStr.startsWith('//', i)) {
			current += '//';
			i++;
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
	while (i >= 0 && /\s/.test(code[i])) {
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
			if (op.length > 1 && expr.startsWith(op, i)) {
				return true;
			}
			if (op.length === 1 && ch === op) {
				return true;
			}
		}
	}

	return false;
}

/**
 * @param {string} expr
 * @returns {boolean}
 */
function hasTopLevelShortOperator(expr) {
	for (const op of SHORT_OPERATORS) {
		if (hasTopLevelOperator(expr, op)) {
			return true;
		}
	}
	return false;
}

/**
 * @param {string} expr
 * @returns {number}
 */
function countTopLevelShortOperators(expr) {
	let count = 0;
	for (const op of SHORT_OPERATORS) {
		if (hasTopLevelOperator(expr, op)) {
			count++;
		}
	}
	return count;
}

/**
 * @param {string} code
 * @param {[number, number][]} safeZones
 * @returns {{ start: number, end: number, name: string, args: string[], argsStr: string }[]}
 */
function findBracketCalls(code, safeZones) {
	const calls = [];

	for (let i = 0; i < code.length; i++) {
		if (isInSafeZone(i, safeZones)) {
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
		const callEnd = closePos + 1;

		if (rangeOverlapsSafeZone(nameStart, callEnd, safeZones)) {
			continue;
		}

		const argsStr = code.slice(i + 1, closePos);
		calls.push({
			start: nameStart,
			end: callEnd,
			name,
			args: splitTopLevelArgs(argsStr),
			argsStr
		});
	}

	return calls;
}

/**
 * @param {{ start: number, end: number, replacement: string }[]} replacements
 * @returns {{ start: number, end: number, replacement: string }[]}
 */
function filterInnermost(replacements) {
	return replacements.filter((candidate) => {
		return !replacements.some(
			(other) =>
				other !== candidate &&
				other.start >= candidate.start &&
				other.end <= candidate.end &&
				(other.start !== candidate.start || other.end !== candidate.end)
		);
	});
}

/**
 * @param {string} code
 * @param {{ start: number, end: number, replacement: string }[]} replacements
 * @returns {string}
 */
function applyReplacements(code, replacements) {
	const innermost = filterInnermost(replacements);
	innermost.sort((a, b) => b.start - a.start);
	let result = code;
	for (const { start, end, replacement } of innermost) {
		result = result.slice(0, start) + replacement + result.slice(end);
	}
	return result;
}

/**
 * @param {string} text
 * @returns {{ text: string, comments: string[] }}
 */
function stripTrailingComments(text) {
	const lines = text.split(/(\r?\n)/);
	const comments = [];
	let result = '';
	let commentIndex = 0;

	for (let i = 0; i < lines.length; i += 2) {
		const line = lines[i] ?? '';
		const lineEnding = lines[i + 1] ?? '';
		let strippedLine = line;
		const safeZones = extractSafeZones(line);

		for (let zoneIndex = safeZones.length - 1; zoneIndex >= 0; zoneIndex--) {
			const [start, end] = safeZones[zoneIndex];
			if (!line.startsWith('(*', start)) {
				continue;
			}

			if (line.slice(end).trim().length !== 0) {
				continue;
			}

			const token = `${TRAILING_COMMENT_TOKEN_PREFIX}${commentIndex}__`;
			comments.push(line.slice(start));
			strippedLine = `${line.slice(0, start)}${token}`;
			commentIndex++;
			break;
		}

		result += strippedLine + lineEnding;
	}

	return { text: result, comments };
}

/**
 * @param {string} text
 * @param {string[]} comments
 * @returns {string}
 */
function restoreTrailingComments(text, comments) {
	let result = text;
	for (let i = 0; i < comments.length; i++) {
		const token = `${TRAILING_COMMENT_TOKEN_PREFIX}${i}__`;
		result = result.replaceAll(token, comments[i]);
	}
	return result;
}

/**
 * @param {string} code
 * @returns {string}
 */
function transformPostfix(code) {
	const safeZones = extractSafeZones(code);
	const blockedRanges = findProtectedCallRanges(code);
	const replacements = [];

	for (const call of findBracketCalls(code, safeZones)) {
		if (isRangeInsideAny(call.start, call.end, blockedRanges)) {
			continue;
		}

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

		const hasSlashSlash = hasTopLevelOperator(expression, '//');
		const hasSemicolon = hasTopLevelOperator(expression, ';');
		const shortOpCount = countTopLevelShortOperators(expression);

		// Wrap in parens only for ; and //, not for /@ and @@
		let outputExpr = expression;
		if (hasSlashSlash || hasSemicolon) {
			outputExpr = `(${expression})`;
		}

		const replacement = `${outputExpr} // ${functionName}`;
		const original = code.slice(call.start, call.end);
		const shouldApply = shortOpCount !== 1 || replacement.length < original.length;

		if (shouldApply) {
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
	const safeZones = extractSafeZones(code);
	const blockedRanges = findProtectedCallRanges(code);
	const replacements = [];

	for (const call of findBracketCalls(code, safeZones)) {
		if (isRangeInsideAny(call.start, call.end, blockedRanges)) {
			continue;
		}

		if (baseSymbolName(call.name) !== symbol) {
			continue;
		}
		if (call.args.length !== 2) {
			continue;
		}

		let left = call.args[0].trim();
		let right = call.args[1].trim();

		if (hasTopLevelShortOperator(left) || hasTopLevelShortOperator(right)) {
			continue;
		}

		// Don't transform if left argument contains // or ; (too complex)
		if (hasTopLevelOperator(left, '//') || hasTopLevelOperator(left, ';')) {
			continue;
		}

		// Wrap right argument if it contains / or ; operators (for correct precedence)
		let needsWrapping = false;
		if (hasTopLevelOperator(right, '//') || hasTopLevelOperator(right, ';')) {
			right = `(${right})`;
			needsWrapping = true;
		}

		const replacement = `${left} ${operator} ${right}`;
		const original = code.slice(call.start, call.end);

		// Allow equal-length if wrapping was needed (for precedence correctness)
		const shouldApply = needsWrapping 
			? replacement.length <= original.length 
			: replacement.length < original.length;

		if (shouldApply) {
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
	const safeZones = extractSafeZones(code);
	const blockedRanges = findProtectedCallRanges(code);
	const replacements = [];
	const calls = findBracketCalls(code, safeZones);

	/**
	 * @param {string} arg
	 * @returns {string}
	 */
	function normalizeLogicalArg(arg) {
		const trimmedArg = arg.trim();
		if (/^[a-zA-Z$`][a-zA-Z0-9$`]*\[.*\]$/.test(trimmedArg)) {
			const shortenedArg = shorten(trimmedArg);
			return shortenedArg;
		}

		return trimmedArg;
	}

	for (const call of calls) {
		if (isRangeInsideAny(call.start, call.end, blockedRanges)) {
			continue;
		}

		if (
			calls.some((otherCall) => {
				if (otherCall === call) {
					return false;
				}

				const otherBaseName = baseSymbolName(otherCall.name);
				return (
					(otherBaseName === 'Not' || otherBaseName === 'And' || otherBaseName === 'Or') &&
					otherCall.start < call.start &&
					otherCall.end > call.end
				);
			})
		) {
			continue;
		}

		const baseName = baseSymbolName(call.name);
		let replacement = null;

		if (baseName === 'Not' && call.args.length === 1) {
			let arg = call.args[0].trim();
			const shortenedArg = applyAllTransformations(arg);
			if (shortenedArg.includes('&&') || shortenedArg.includes('||') || shortenedArg.includes('//')) {
				replacement = `!(${shortenedArg})`;
			} else {
				replacement = `!${shortenedArg}`;
			}
		} else if (baseName === 'And' && call.args.length >= 1) {
			const wrappedArgs = call.args.map((arg) => {
				const normalizedArg = normalizeLogicalArg(arg);
				return normalizedArg.includes('||') ? `(${normalizedArg})` : normalizedArg;
			});
			replacement = wrappedArgs.join(' && ');
		} else if (baseName === 'Or' && call.args.length >= 1) {
			const wrappedArgs = call.args.map((arg) => {
				const normalizedArg = normalizeLogicalArg(arg);
				return normalizedArg.includes('&&') ? `(${normalizedArg})` : normalizedArg;
			});
			replacement = wrappedArgs.join(' || ');
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
	const safeZones = extractSafeZones(code);
	const blockedRanges = findProtectedCallRanges(code);
	const replacements = [];

	for (const call of findBracketCalls(code, safeZones)) {
		if (isRangeInsideAny(call.start, call.end, blockedRanges)) {
			continue;
		}

		if (baseSymbolName(call.name) !== 'Part') {
			continue;
		}
		if (call.args.length !== 2) {
			continue;
		}

		const expr = call.args[0].trim();
		const index = call.args[1].trim();

		// Wrap expr in parens if it contains operators
		const needsWrap = hasTopLevelShortOperator(expr);
		const wrappedExpr = needsWrap ? `(${expr})` : expr;
		const replacement = `${wrappedExpr}[[${index}]]`;
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
 * @returns {{ enablePostfix: boolean, enableMapOperator: boolean, enableApplyOperator: boolean, enableLogicalOperators: boolean, enablePartNotation: boolean }}
 */
function getSettings() {
	if (!vscode || !vscode.workspace || !vscode.workspace.getConfiguration) {
		return DEFAULT_SETTINGS;
	}

	const configuration = vscode.workspace.getConfiguration('wolframShortener');

	return {
		enablePostfix: configuration.get('enablePostfix', true),
		enableMapOperator: configuration.get('enableMapOperator', true),
		enableApplyOperator: configuration.get('enableApplyOperator', true),
		enableLogicalOperators: configuration.get('enableLogicalOperators', true),
		enablePartNotation: configuration.get('enablePartNotation', true)
	};
}

/**
 * @param {string} text
 * @returns {string}
 */
function shorten(text) {
	const stripped = stripTrailingComments(text);
	const masked = maskAssignmentLeftSides(stripped.text);
	const current = applyAllTransformations(masked.text, getSettings());

	return restoreTrailingComments(restoreAssignmentLeftSides(current, masked.assignments), stripped.comments);
}

/**
 * @param {string} text
 * @param {{ enablePostfix: boolean, enableMapOperator: boolean, enableApplyOperator: boolean, enableLogicalOperators: boolean, enablePartNotation: boolean }} [settings]
 * @returns {string}
 */
function applyAllTransformations(text, settings = getSettings()) {
	const transforms = [];

	if (settings.enableMapOperator) {
		transforms.push(transformMap);
	}
	if (settings.enableApplyOperator) {
		transforms.push(transformApply);
	}
	if (settings.enableLogicalOperators) {
		transforms.push(transformLogical);
	}
	if (settings.enablePartNotation) {
		transforms.push(transformPart);
	}
	if (settings.enablePostfix) {
		transforms.push(transformPostfix);
	}

	let previous;
	let iterations = 0;
	let current = text;

	do {
		previous = current;
		for (const transform of transforms) {
			current = transform(current);
		}
		iterations++;
	} while (previous !== current && iterations < 10);

	return current;
}

module.exports = { shorten };

if (require.main === module) {
	let passed = 0;
	let failed = 0;

	/**
	 * @param {string} name
	 * @param {string} input
	 * @param {string} expected
	 */
	function test(name, input, expected) {
		const result = shorten(input);
		if (result === expected) {
			passed++;
			console.log(`PASS: ${name}`);
		} else {
			failed++;
			console.log(`FAIL: ${name}`);
			console.log(`  input:    ${JSON.stringify(input)}`);
			console.log(`  expected: ${JSON.stringify(expected)}`);
			console.log(`  got:      ${JSON.stringify(result)}`);
		}
	}

	/**
	 * @param {string} name
	 * @param {string} input
	 */
	function testIdempotent(name, input) {
		const once = shorten(input);
		const twice = shorten(once);
		if (once === twice) {
			passed++;
			console.log(`PASS: ${name}`);
		} else {
			failed++;
			console.log(`FAIL: ${name}`);
			console.log(`  once:  ${JSON.stringify(once)}`);
			console.log(`  twice: ${JSON.stringify(twice)}`);
		}
	}

	test('Map operator', 'Map[Sqrt, {1,2,3}]', 'Sqrt /@ {1,2,3}');
	test('Apply operator', 'Apply[Plus, {1,2,3}]', 'Plus @@ {1,2,3}');
	test('Not operator', 'Not[x]', '!x');
	test('Not operator with infix expression', 'Not[a && b]', '!(a && b)');
	test('Not operator with postfix expression', 'Not[x // f]', '!(x // f)');
	test('And operator', 'And[a, b, c]', 'a && b && c');
	test('And operator wraps Or argument', 'And[a, Or[b, c]]', 'a && (b || c)');
	test('Or operator', 'Or[x, y]', 'x || y');
	test('Or operator wraps And argument', 'Or[x, And[y, z]]', 'x || (y && z)');
	test('Part notation', 'Part[myList, 3]', 'myList[[3]]');

	test(
		'multiline Map',
		'Map[\n  Sqrt,\n  {1, 2, 3}\n]',
		'Sqrt /@ {1, 2, 3}'
	);

	test(
		'nested inner-first',
		'Print[Map[Sqrt, {1,2,3}]]',
		'Print[Sqrt /@ {1,2,3}]'
	);

	test('comment untouched', '(* Map[x, y] *)', '(* Map[x, y] *)');
	test('trailing comment preserved', 'Map[Sqrt, {1,2,3}] (* note *)', 'Sqrt /@ {1,2,3} (* note *)');
	test('string untouched', '"Map[x, y]"', '"Map[x, y]"');
	test(
		'string with brackets inside',
		'Map[a, "f[1, 2]"]',
		'a /@ "f[1, 2]"'
	);
	test('Map arg with //', 'Map[f // g, {1,2,3}]', 'Map[f // g, {1,2,3}]');

	// BUG 1: Not needs to shorten inner arg first
	test('BUG 1: Not[And[a, b]]', 'Not[And[a, b]]', '!(a && b)');

	// BUG 2: Postfix should wrap args with short operators
	test('BUG 2: Print[Sqrt /@ Plus @@ {1,2,3}]', 'Print[Sqrt /@ Plus @@ {1,2,3}]', 'Sqrt /@ Plus @@ {1,2,3} // Print');

	// BUG 3: Part should work with operator-containing args
	test('BUG 3: Part[Sqrt /@ {1,4,9}, 2]', 'Part[Sqrt /@ {1,4,9}, 2]', '(Sqrt /@ {1,4,9})[[2]]');

	// BUG 4: Trailing comments should be preserved
	test('BUG 4: Print[Range[10]] (* comment *)', 'Print[Range[10]] (* comment *)', 'Range[10] // Print (* comment *)');

	// BUG 5: splitTopLevelArgs should handle // correctly
	test('BUG 5: Map[Sqrt, Range[10] // Sort]', 'Map[Sqrt, Range[10] // Sort]', 'Sqrt /@ (Range[10] // Sort)');

	testIdempotent('already shortened Map', 'Sqrt /@ {1,2,3}');
	testIdempotent('already shortened Apply', 'Plus @@ {1,2,3}');
	testIdempotent('already shortened Not', '!x');
	testIdempotent('already shortened Part', 'myList[[3]]');

	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
}
