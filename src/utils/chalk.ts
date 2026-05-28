import process from "node:process";

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  redBright: "\x1b[91m",
  green: "\x1b[32m",
  greenBright: "\x1b[92m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  blueBright: "\x1b[94m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  whiteBright: "\x1b[97m",
  gray: "\x1b[90m"
};

const colorEnabled = Boolean(process.stdout.isTTY) && process.env.NO_COLOR !== "1";

function paint(code: string, text: string): string {
  if (!colorEnabled) return text;
  return `${code}${text}${ansi.reset}`;
}

export const chalk = {
  bold: Object.assign(
    (text: string) => paint(ansi.bold, text),
    {
      cyan: (text: string) => paint(ansi.bold + ansi.cyan, text),
      green: (text: string) => paint(ansi.bold + ansi.green, text),
      magenta: (text: string) => paint(ansi.bold + ansi.magenta, text),
      blue: (text: string) => paint(ansi.bold + ansi.blue, text),
      red: (text: string) => paint(ansi.bold + ansi.red, text),
      yellow: (text: string) => paint(ansi.bold + ansi.yellow, text),
      whiteBright: (text: string) => paint(ansi.bold + ansi.whiteBright, text)
    }
  ),
  cyan: (text: string) => paint(ansi.cyan, text),
  green: (text: string) => paint(ansi.green, text),
  greenBright: (text: string) => paint(ansi.greenBright, text),
  red: (text: string) => paint(ansi.red, text),
  redBright: (text: string) => paint(ansi.redBright, text),
  yellow: (text: string) => paint(ansi.yellow, text),
  blue: (text: string) => paint(ansi.blue, text),
  blueBright: (text: string) => paint(ansi.blueBright, text),
  magenta: (text: string) => paint(ansi.magenta, text),
  gray: (text: string) => paint(ansi.gray, text),
  white: (text: string) => paint(ansi.white, text),
  whiteBright: (text: string) => paint(ansi.whiteBright, text)
};

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
