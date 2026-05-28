import type {
  NpmTransitiveGraph,
  NpmTransitiveGraphEdge,
  NpmTransitiveGraphNode,
} from "../types.js";
import { compareVersions, looksLikeVersion } from "../utils/version.js";

export function createNpmTransitiveGraph(args: {
  nodes: NpmTransitiveGraphNode[];
  edges: NpmTransitiveGraphEdge[];
}): NpmTransitiveGraph {
  const nodesById = new Map<string, NpmTransitiveGraphNode>();
  const nodeIdsByPackageKey = new Map<string, string[]>();
  const childNodeIdsByParentNodeId = new Map<string, string[]>();
  const rangeByParentNodeId = new Map<string, Map<string, string>>();

  for (const node of args.nodes) {
    nodesById.set(node.id, { ...node });
    nodeIdsByPackageKey.set(buildPackageKey(node.name, node.version), [
      ...(nodeIdsByPackageKey.get(buildPackageKey(node.name, node.version)) ?? []),
      node.id,
    ]);
  }

  for (const edge of args.edges) {
    childNodeIdsByParentNodeId.set(edge.parentNodeId, [
      ...(childNodeIdsByParentNodeId.get(edge.parentNodeId) ?? []),
      edge.childNodeId,
    ]);

    const ranges = rangeByParentNodeId.get(edge.parentNodeId) ?? new Map<string, string>();
    ranges.set(edge.childName, edge.range);
    rangeByParentNodeId.set(edge.parentNodeId, ranges);
  }

  return {
    nodeIdsFor(name: string, version: string | null): readonly string[] {
      return Object.freeze([...(nodeIdsByPackageKey.get(buildPackageKey(name, version)) ?? [])]);
    },
    getNode(nodeId: string): Readonly<NpmTransitiveGraphNode> | null {
      const node = nodesById.get(nodeId);
      return node ? Object.freeze({ ...node }) : null;
    },
    childrenFor(nodeId: string): readonly string[] {
      return Object.freeze([...(childNodeIdsByParentNodeId.get(nodeId) ?? [])]);
    },
    rangeFor(parentNodeId: string, childName: string): string | null {
      return rangeByParentNodeId.get(parentNodeId)?.get(childName) ?? null;
    },
  };
}

function buildPackageKey(name: string, version: string | null): string {
  return `${name}@${version ?? "null"}`;
}

export function findSafeVersionWithinParentRange(args: {
  graph: NpmTransitiveGraph;
  parentNodeId: string;
  childName: string;
  candidates: string[];
}): string | null {
  const allowedRange = args.graph.rangeFor(args.parentNodeId, args.childName);
  if (!allowedRange) return null;

  const matchingCandidates = args.candidates
    .filter(looksLikeVersion)
    .filter(candidate => versionSatisfiesRange(candidate, allowedRange))
    .sort(compareVersions);

  return matchingCandidates.at(-1) ?? null;
}

function versionSatisfiesRange(version: string, rawRange: string): boolean {
  const range = rawRange.trim();
  if (!range) return false;
  if (range === "*" || range === "latest") return true;

  const orParts = range.split("||").map(part => part.trim()).filter(Boolean);
  return orParts.some(part => satisfiesAndRange(version, part));
}

function satisfiesAndRange(version: string, range: string): boolean {
  const normalized = normalizeRange(range);
  if (!normalized) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.every(token => satisfiesComparator(version, token));
}

function normalizeRange(range: string): string | null {
  const trimmed = range.trim();
  if (!trimmed) return null;

  if (looksLikeVersion(trimmed)) {
    return `=${trimmed}`;
  }

  if (trimmed.startsWith("^")) {
    const base = trimmed.slice(1);
    if (!looksLikeVersion(base)) return null;
    const [major, minor, patch] = parseCoreVersion(base);
    if (major > 0) return `>=${base} <${major + 1}.0.0`;
    if (minor > 0) return `>=${base} <0.${minor + 1}.0`;
    return `>=${base} <0.0.${patch + 1}`;
  }

  if (trimmed.startsWith("~")) {
    const base = trimmed.slice(1);
    if (!looksLikeVersion(base)) return null;
    const [major, minor] = parseCoreVersion(base);
    return `>=${base} <${major}.${minor + 1}.0`;
  }

  return trimmed;
}

function satisfiesComparator(version: string, comparator: string): boolean {
  const token = comparator.trim();
  if (!token) return true;

  const match = token.match(/^(<=|>=|<|>|=)?\s*([0-9]+\.[0-9]+\.[0-9]+(?:[-+][^\s]+)?)$/);
  if (!match) return false;

  const operator = match[1] ?? "=";
  const target = match[2];
  const cmp = compareVersions(version, target);

  switch (operator) {
    case "<":
      return cmp < 0;
    case "<=":
      return cmp <= 0;
    case ">":
      return cmp > 0;
    case ">=":
      return cmp >= 0;
    case "=":
      return cmp === 0;
    default:
      return false;
  }
}

function parseCoreVersion(version: string): [number, number, number] {
  const [major = "0", minor = "0", patch = "0"] = version.split(/[+-]/)[0].split(".");
  return [Number(major), Number(minor), Number(patch)];
}
