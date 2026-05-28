import process from "node:process";
import type { Spinner } from "../types.js";
import { chalk } from "../utils/chalk.js";

export function createSpinner(initialMessage: string, options?: { json?: boolean }): Spinner {
  const enabled = Boolean(process.stdout.isTTY);
  if (!enabled) {
    return {
      update: () => {},
      succeed: () => {},
      fail: () => {},
      stop: () => {}
    };
  }

  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frameIndex = 0;
  let currentMessage = initialMessage;

  const render = () => {
    process.stdout.write(`\r\x1b[2K${chalk.cyan(frames[frameIndex])} ${currentMessage}`);
    frameIndex = (frameIndex + 1) % frames.length;
  };

  render();
  const timer = setInterval(render, 80);

  const clearLine = () => {
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
  };

  return {
    update(message: string) {
      currentMessage = message;
      render();
    },
    succeed(message: string) {
      clearLine();
      console.log(chalk.green(`✓ ${message}`));
    },
    fail(message: string) {
      clearLine();
      console.log(chalk.red(`✗ ${message}`));
    },
    stop() {
      clearLine();
    }
  };
}
