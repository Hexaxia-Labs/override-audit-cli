import { looksLikePlatformBinary } from '../../../src/overrides/detectors/platform-binary.js';

describe('looksLikePlatformBinary', () => {
  it.each([
    '@esbuild/linux-x64',
    '@esbuild/darwin-arm64',
    '@esbuild/win32-x64',
    '@next/swc-linux-x64-gnu',
    '@next/swc-darwin-arm64',
    '@rollup/rollup-linux-x64-musl',
    '@swc/core-linux-x64-gnu',
    '@biomejs/cli-linux-x64',
    '@img/sharp-linux-x64',
    '@parcel/watcher-linux-x64-glibc',
    '@oxc-project/runtime-linux-x64-musl',
    'lightningcss-linux-x64-musl',
    'lightningcss-darwin-arm64',
    'sharp-linux-x64',
    'esbuild-linux-x64',
  ])('matches platform binary: %s', (name) => {
    expect(looksLikePlatformBinary(name)).toBe(true);
  });

  it.each([
    'postcss',
    'react',
    'next',
    'esbuild',
    'rollup',
    'swc',
    '@next/font',
    '@radix-ui/react-dialog',
    '@types/node',
    'tailwindcss',
  ])('does NOT match non-binary: %s', (name) => {
    expect(looksLikePlatformBinary(name)).toBe(false);
  });
});
