const useColor = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);

const c = useColor
  ? {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      dim: '\x1b[2m',
      italic: '\x1b[3m',
      underline: '\x1b[4m',
      inverse: '\x1b[7m',
      black: '\x1b[30m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
      bgBlack: '\x1b[40m',
      bgRed: '\x1b[41m',
      bgGreen: '\x1b[42m',
      bgYellow: '\x1b[43m',
      bgBlue: '\x1b[44m',
      bgMagenta: '\x1b[45m',
      bgCyan: '\x1b[46m',
      bgWhite: '\x1b[47m',
      bgDarkGray: '\x1b[100m',
      gray: '\x1b[90m',
      brightGreen: '\x1b[92m',
      brightYellow: '\x1b[93m',
      brightCyan: '\x1b[96m',
      brightWhite: '\x1b[97m',
    }
  : {
      reset: '',
      bold: '',
      dim: '',
      italic: '',
      underline: '',
      inverse: '',
      black: '',
      red: '',
      green: '',
      yellow: '',
      blue: '',
      magenta: '',
      cyan: '',
      white: '',
      bgBlack: '',
      bgRed: '',
      bgGreen: '',
      bgYellow: '',
      bgBlue: '',
      bgMagenta: '',
      bgCyan: '',
      bgWhite: '',
      bgDarkGray: '',
      gray: '',
      brightGreen: '',
      brightYellow: '',
      brightCyan: '',
      brightWhite: '',
    };

function stripAnsi(str) {
  if (!str) return '';
  return String(str).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

function stringWidth(str) {
  const stripped = stripAnsi(str);
  let width = 0;
  for (const char of stripped) {
    const cp = char.codePointAt(0);
    if (!cp) continue;
    // Common wide emoji / symbols / East Asian characters
    if (
      (cp >= 0x1100 && cp <= 0x115F) ||
      (cp >= 0x2329 && cp <= 0x232A) ||
      (cp >= 0x2E80 && cp <= 0x303E) ||
      (cp >= 0x3040 && cp <= 0xA4CF) ||
      (cp >= 0xAC00 && cp <= 0xD7A3) ||
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE10 && cp <= 0xFE19) ||
      (cp >= 0xFE30 && cp <= 0xFE6F) ||
      (cp >= 0xFF00 && cp <= 0xFF60) ||
      (cp >= 0xFFE0 && cp <= 0xFFE6) ||
      (cp >= 0x1F300 && cp <= 0x1F64F) ||
      (cp >= 0x1F680 && cp <= 0x1F6FF) ||
      (cp >= 0x2600 && cp <= 0x27BF)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function padRight(str, len) {
  const visualLen = stringWidth(str);
  if (visualLen >= len) return str;
  return str + ' '.repeat(len - visualLen);
}

function truncate(str, maxLen) {
  if (stringWidth(str) <= maxLen) return str;
  let res = '';
  for (const char of str) {
    if (stringWidth(res + char + '…') > maxLen) {
      return res + '…';
    }
    res += char;
  }
  return res + '…';
}

module.exports = {
  c,
  stripAnsi,
  stringWidth,
  padRight,
  truncate,
};
