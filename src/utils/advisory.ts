import type { PackageRef } from "../types.js";
import { NPM_PUBLIC_REGISTRY } from "../constants.js";

export function isPrivateRegistrySource(pkg: PackageRef): boolean {
  return (
    pkg.resolvedUrl !== undefined &&
    pkg.resolvedUrl !== "" &&
    !pkg.resolvedUrl.startsWith(NPM_PUBLIC_REGISTRY)
  );
}

const GIT_SOURCE_PREFIXES = [
  "https://codeload.github.com/",
  "https://github.com/",
  "https://gitlab.com/",
  "https://bitbucket.org/",
  "git+https://",
  "git+ssh://",
  "git://",
];

export function isGitSource(pkg: PackageRef): boolean {
  return (
    pkg.resolvedUrl !== undefined &&
    pkg.resolvedUrl !== "" &&
    GIT_SOURCE_PREFIXES.some(prefix => pkg.resolvedUrl!.startsWith(prefix))
  );
}

export function hasCommitShaPinning(pkg: PackageRef): boolean {
  return pkg.resolvedUrl !== undefined && /[0-9a-f]{40}/i.test(pkg.resolvedUrl);
}
