import { chalk } from "../utils/chalk.js";
import { readConfig, writeConfig, getConfigPath, validateCaCertFile, ConfigAction, ConfigKey } from "./config.js";
import type { ConfigSubcommand } from "./args.js";

export function runConfigCommand(sub: ConfigSubcommand): void {
  if (sub.action === ConfigAction.Show) {
    const config = readConfig();
    const keys = Object.keys(config);
    if (keys.length === 0) {
      console.log("No configuration set.");
      console.log(chalk.gray(`Config file: ${getConfigPath()}`));
      return;
    }
    console.log(chalk.gray(`Config file: ${getConfigPath()}`));
    console.log("");
    if (config.caCert) {
      console.log(`  ${chalk.bold(ConfigKey.CaCert)}  ${chalk.cyan(config.caCert)}`);
    }
    return;
  }

  if (sub.action === ConfigAction.Set && sub.key === ConfigKey.CaCert) {
    validateCaCertFile(sub.value);
    const config = readConfig();
    config.caCert = sub.value;
    writeConfig(config);
    console.log(`${chalk.green("✔")} Saved: ${chalk.bold(ConfigKey.CaCert)} = ${chalk.cyan(sub.value)}`);
    console.log(chalk.gray(`Config file: ${getConfigPath()}`));
    return;
  }

  if (sub.action === ConfigAction.Unset && sub.key === ConfigKey.CaCert) {
    const config = readConfig();
    if (!config.caCert) {
      console.log(`${chalk.bold(ConfigKey.CaCert)} is not set.`);
      return;
    }
    delete config.caCert;
    writeConfig(config);
    console.log(`${chalk.green("✔")} Removed: ${chalk.bold(ConfigKey.CaCert)}`);
    console.log(chalk.gray(`Config file: ${getConfigPath()}`));
    return;
  }
}
