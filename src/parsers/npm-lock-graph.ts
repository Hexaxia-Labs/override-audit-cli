import fs from "node:fs";
import type { NpmLockGraph, NpmLockNode } from "../types.js";
import { unique, uniquePathArrays } from "../utils/array.js";

type RawLockPackage = {
  name?: string;
  version?: string;
  dev?: boolean;
  link?: boolean;
  resolved?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

export function loadNpmLockGraph(
  filePath: string,
  options?: { includePaths?: boolean },
): NpmLockGraph {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const packages = raw?.packages;
  const rawPackages = isRecord(packages) ? (packages as Record<string, RawLockPackage>) : {};
  const nodesById = new Map<string, NpmLockNode>();
  const nodeIdsByPackageKey = new Map<string, string[]>();
  const nodeIdByPackagePath = new Map<string, string>();
  const dependencyRangesByNodeId = new Map<string, Record<string, string>>();
  const resolutionBasePathsByNodeId = new Map<string, string[]>();
  const parentNodeIdsByChildNodeId = new Map<string, string[]>();
  const childNodeIdsByParentNodeId = new Map<string, string[]>();
  const rangeByParentNodeId = new Map<string, Map<string, string>>();
  const pathSetByNodeId = new Map<string, Set<string>>();

  if (!packages || typeof packages !== "object") {
    return createGraph({
      entryPackages: [],
      nodesById,
      nodeIdsByPackageKey,
      parentNodeIdsByChildNodeId,
      childNodeIdsByParentNodeId,
      rangeByParentNodeId,
      pathSetByNodeId,
    });
  }

  for (const [packagePath, meta] of Object.entries<RawLockPackage>(rawPackages)) {
    if (!packagePath || packagePath === "") continue;
    if (!packagePath.includes("node_modules/")) continue;

    const name = packageNameFromPath(packagePath) ?? meta?.name;
    const version = meta?.version;
    const isLinkNode = !!meta?.link;
    if (!name || (!version && !isLinkNode)) continue;

    const id = packagePath;
    const normalizedVersion = version ?? null;
    const packageKey = buildPackageKey(name, normalizedVersion);

    nodesById.set(id, {
      id,
      packageKey,
      name,
      version: normalizedVersion,
      packagePath,
      dev: !!meta?.dev,
    });
    nodeIdByPackagePath.set(packagePath, id);
    nodeIdsByPackageKey.set(packageKey, [...(nodeIdsByPackageKey.get(packageKey) ?? []), id]);
    dependencyRangesByNodeId.set(id, collectDependencyRanges(resolveDependencySource(meta, rawPackages)));
    resolutionBasePathsByNodeId.set(id, resolveBasePaths(packagePath, meta));
  }

  const rootMeta = isRecord(rawPackages[""]) ? rawPackages[""] : null;
  const entryPackages = resolveEdgesForParent(
    "",
    collectRootDependencyRanges(rootMeta),
    [""],
    nodeIdByPackagePath,
    childNodeIdsByParentNodeId,
    parentNodeIdsByChildNodeId,
    rangeByParentNodeId,
  );

  for (const node of nodesById.values()) {
    resolveEdgesForParent(
      node.packagePath,
      dependencyRangesByNodeId.get(node.id) ?? {},
      resolutionBasePathsByNodeId.get(node.id) ?? [node.packagePath],
      nodeIdByPackagePath,
      childNodeIdsByParentNodeId,
      parentNodeIdsByChildNodeId,
      rangeByParentNodeId,
    );
  }

  if (options?.includePaths !== false) {
    const MAX_PATHS_PER_NODE = 5;
    const MAX_PATH_DEPTH = 10;
    const queue: { nodeId: string; path: string[] }[] = entryPackages.map((entryNodeId) => ({
      nodeId: entryNodeId,
      path: ["project", nodesById.get(entryNodeId)?.name ?? entryNodeId],
    }));
    let queueHead = 0;

    while (queueHead < queue.length) {
      const current = queue[queueHead++];

      rememberPath(pathSetByNodeId, current.nodeId, current.path);

      if (current.path.length >= MAX_PATH_DEPTH) continue;

      for (const childNodeId of childNodeIdsByParentNodeId.get(current.nodeId) ?? []) {
        const childNode = nodesById.get(childNodeId);
        if (!childNode) continue;

        const beforeSize = pathSetByNodeId.get(childNodeId)?.size ?? 0;
        if (beforeSize >= MAX_PATHS_PER_NODE) continue;

        const nextPath = [...current.path, childNode.name];
        rememberPath(pathSetByNodeId, childNodeId, nextPath);
        const afterSize = pathSetByNodeId.get(childNodeId)?.size ?? 0;

        if (afterSize > beforeSize) {
          queue.push({ nodeId: childNodeId, path: nextPath });
        }
      }
    }
  }

  return createGraph({
    entryPackages,
    nodesById,
    nodeIdsByPackageKey,
    parentNodeIdsByChildNodeId,
    childNodeIdsByParentNodeId,
    rangeByParentNodeId,
    pathSetByNodeId,
  });
}

function createGraph(args: {
  entryPackages: string[];
  nodesById: Map<string, NpmLockNode>;
  nodeIdsByPackageKey: Map<string, string[]>;
  parentNodeIdsByChildNodeId: Map<string, string[]>;
  childNodeIdsByParentNodeId: Map<string, string[]>;
  rangeByParentNodeId: Map<string, Map<string, string>>;
  pathSetByNodeId: Map<string, Set<string>>;
}): NpmLockGraph {
  const entryPackages = Object.freeze([...unique(args.entryPackages)]);

  return {
    entryPackages,
    nodeIdsFor(name: string, version: string | null): readonly string[] {
      return Object.freeze([...(args.nodeIdsByPackageKey.get(buildPackageKey(name, version)) ?? [])]);
    },
    getNode(nodeId: string): Readonly<NpmLockNode> | null {
      const node = args.nodesById.get(nodeId);
      return node ? Object.freeze({ ...node }) : null;
    },
    parentsFor(nodeId: string): readonly string[] {
      return Object.freeze([...(args.parentNodeIdsByChildNodeId.get(nodeId) ?? [])]);
    },
    childrenFor(nodeId: string): readonly string[] {
      return Object.freeze([...(args.childNodeIdsByParentNodeId.get(nodeId) ?? [])]);
    },
    rangeFor(parentNodeId: string, childName: string): string | null {
      return args.rangeByParentNodeId.get(parentNodeId)?.get(childName) ?? null;
    },
    pathsFor(nodeId: string): string[][] {
      const serializedPaths = [...(args.pathSetByNodeId.get(nodeId) ?? new Set<string>())]
        .map((item) => item.split(">"));
      return uniquePathArrays(serializedPaths);
    },
  };
}

function resolveEdgesForParent(
  parentPackagePath: string,
  dependencyRanges: Record<string, string>,
  resolutionBasePaths: string[],
  nodeIdByPackagePath: Map<string, string>,
  childNodeIdsByParentNodeId: Map<string, string[]>,
  parentNodeIdsByChildNodeId: Map<string, string[]>,
  rangeByParentNodeId: Map<string, Map<string, string>>,
): string[] {
  const resolvedChildNodeIds: string[] = [];

  for (const [dependencyName, range] of Object.entries(dependencyRanges)) {
    const childPackagePath = resolveDependencyPackagePath(resolutionBasePaths, dependencyName, nodeIdByPackagePath);
    if (!childPackagePath) continue;

    const childNodeId = nodeIdByPackagePath.get(childPackagePath);
    if (!childNodeId) continue;

    resolvedChildNodeIds.push(childNodeId);

    const parentNodeId = parentPackagePath ? nodeIdByPackagePath.get(parentPackagePath) : null;
    if (!parentNodeId) continue;

    childNodeIdsByParentNodeId.set(
      parentNodeId,
      unique([...(childNodeIdsByParentNodeId.get(parentNodeId) ?? []), childNodeId]),
    );
    parentNodeIdsByChildNodeId.set(
      childNodeId,
      unique([...(parentNodeIdsByChildNodeId.get(childNodeId) ?? []), parentNodeId]),
    );

    const rangesForParent = rangeByParentNodeId.get(parentNodeId) ?? new Map<string, string>();
    rangesForParent.set(dependencyName, range);
    rangeByParentNodeId.set(parentNodeId, rangesForParent);
  }

  return unique(resolvedChildNodeIds);
}

function collectDependencyRanges(meta: RawLockPackage | null | undefined): Record<string, string> {
  if (!meta) return {};

  const ranges: Record<string, string> = {};
  for (const source of [
    meta.dependencies,
    meta.optionalDependencies,
  ]) {
    if (!source || typeof source !== "object") continue;
    for (const [name, range] of Object.entries(source)) {
      if (typeof range !== "string" || !range) continue;
      ranges[name] = range;
    }
  }

  return ranges;
}

function collectRootDependencyRanges(meta: RawLockPackage | null | undefined): Record<string, string> {
  if (!meta) return {};

  const ranges = collectDependencyRanges(meta);
  if (meta.devDependencies && typeof meta.devDependencies === "object") {
    for (const [name, range] of Object.entries(meta.devDependencies)) {
      if (typeof range !== "string" || !range) continue;
      ranges[name] = range;
    }
  }

  return ranges;
}

function resolveDependencyPackagePath(
  basePaths: string[],
  dependencyName: string,
  nodeIdByPackagePath: Map<string, string>,
): string | null {
  for (const basePath of basePaths) {
    let currentPath: string | null = basePath;

    while (currentPath !== null) {
      const candidatePath = currentPath
        ? `${currentPath}/node_modules/${dependencyName}`
        : `node_modules/${dependencyName}`;
      if (nodeIdByPackagePath.has(candidatePath)) {
        return candidatePath;
      }

      currentPath = nextAncestorPackagePath(currentPath);
    }
  }

  return null;
}

function nextAncestorPackagePath(packagePath: string): string | null {
  if (!packagePath) return null;

  const nestedIndex = packagePath.lastIndexOf("/node_modules/");
  if (nestedIndex >= 0) {
    return packagePath.slice(0, nestedIndex);
  }

  if (packagePath.startsWith("node_modules/")) {
    return "";
  }

  return null;
}

function packageNameFromPath(packagePath: string): string | null {
  const marker = "node_modules/";
  const markerIndex = packagePath.lastIndexOf(marker);
  if (markerIndex === -1) return null;

  const name = packagePath.slice(markerIndex + marker.length);
  return name || null;
}

function rememberPath(pathSetByNodeId: Map<string, Set<string>>, nodeId: string, pathParts: string[]) {
  const serialized = pathParts.join(">");
  const existing = pathSetByNodeId.get(nodeId) ?? new Set<string>();
  existing.add(serialized);
  pathSetByNodeId.set(nodeId, existing);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function buildPackageKey(name: string, version: string | null): string {
  return `${name}@${version ?? "<link>"}`;
}

function resolveDependencySource(
  meta: RawLockPackage | null | undefined,
  rawPackages: Record<string, RawLockPackage>,
): RawLockPackage | null {
  if (!meta) return null;
  if (!meta.link || !meta.resolved) return meta;

  const linkedTarget = rawPackages[meta.resolved];
  return linkedTarget ?? meta;
}

function resolveBasePaths(packagePath: string, meta: RawLockPackage | null | undefined): string[] {
  if (!meta?.link || !meta.resolved) {
    return [packagePath];
  }

  return unique([meta.resolved, packagePath]);
}
