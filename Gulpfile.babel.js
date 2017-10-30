/* @flow */
/* eslint import/no-extraneous-dependencies: ['error', {'devDependencies': true}] */
import babel from 'rollup-plugin-babel';
import fs from 'fs';
import gulp from 'gulp';
import gulpBabel from 'gulp-babel';
import gutil from 'gulp-util';
import json from 'rollup-plugin-json';
import mkdirp from 'mkdirp';
import newer from 'gulp-newer';
import path from 'path';
import plumber from 'gulp-plumber';
import replace from 'rollup-plugin-replace';
import resolve from 'rollup-plugin-node-resolve';
import { rollup } from 'rollup';
import sourcemaps from 'rollup-plugin-sourcemaps';
import through from 'through2';

gulp.task('default', ['build']);

const sourcesOrder = [
  ['neo-blockchain-core'],
  [
    'neo-blockchain-client',
    'neo-blockchain-neo-settings',
    'neo-blockchain-node-core',
  ],
  [
    'neo-blockchain-vm',
    'neo-blockchain-impl',
    'neo-blockchain-levelup',
    'neo-blockchain-offline',
    'neo-blockchain-network',
  ],
  [
    'neo-blockchain-node',
    'neo-blockchain-rpc',
  ],
  ['neo-blockchain-full-node'],
  ['neo-blockchain-bin'],
];
const sources = sourcesOrder.reduce(
  (acc, currentSources) => acc.concat(currentSources),
  [],
);

const dependencies = [...new Set(sources.reduce(
  (acc, source) => acc.concat(
    Object.keys(JSON.parse(
      fs.readFileSync(
        path.resolve('./packages', source, './package.json'),
        'utf-8'
      )
    ).dependencies),
  ),
  [],
))].concat([
  'fs',
  'http',
  'https',
  'net',
  'os',
  'path',
  'perf_hooks',
  'stream',
  'zlib',
]);

const FORMATS = [
  'cjs',
  'es',
];

const getBabelConfig = ({
  modules,
}: {|
  modules: boolean | string,
|}) => ({
  babelrc: false,
  presets: [
    'flow',
    ['env', {
      useBuiltIns: 'usage',
      modules,
    }]
  ],
  plugins: [
    'transform-async-generator-functions',
    'transform-class-properties',
    'transform-object-rest-spread',
    ['transform-builtin-classes', {
      'globals': ['Error']
    }],
    'transform-runtime',
  ],
});

const createRollupInput = ({
  source,
}: {|
  source: string,
|}) => {
  const dir = `./packages/${source}/src/`
  return {
    input: `${dir}index.js`,
    external: (module: string) =>
      dependencies.some(dep => dep !== source && module.startsWith(dep)),
    plugins: [
      resolve({
        module: true,
        jsnext: true,
        main: true,
        preferBuiltins: true,
      }),
      replace({
        include: 'node_modules/JSONStream/index.js',
        values: {
          '#!/usr/bin/env node': '',
          '#! /usr/bin/env node': '',
        },
      }),
      json({ preferConst: true }),
      babel({
        exclude: 'node_modules/**',
        runtimeHelpers: true,
        ...getBabelConfig({ modules: false }),
      }),
      sourcemaps(),
    ],
  };
};

const writeBundle = async ({
  source,
  bundle,
  format,
}: {|
  source: string,
  bundle: any,
  format: 'cjs' | 'es',
|}) => {
  await bundle.write({
    file: `./packages/${source}/dist/${format === 'cjs' ? 'index' : format}.js`,
    format,
    name: source,
    sourcemap: true,
  });
}

const writeBundles = async ({
  source,
  bundle,
}: {|
  source: string,
  bundle: any,
|}) => {
  await Promise.all(FORMATS.map(format => writeBundle({
    source,
    bundle,
    format,
  })));
}

const buildSource = async ({ source }: {| source: string |}) => {
  const bundle = await rollup(createRollupInput({ source }));

  await writeBundles({ source, bundle });
};

gulp.task('build:dist', async () => {
  await Promise.all(sources.map(source => buildSource({ source })));
});

function swapSrcWithDist(srcPath) {
  const parts = srcPath.split(path.sep);
  parts[1] = 'dist';
  return parts.join(path.sep);
}

const flowIndex = `/* @flow */

export * from '../src';
`

gulp.task('build:flow', () =>
  sources.forEach(source => {
    const dir = `./packages/${source}/dist`;
    mkdirp.sync(dir);
    fs.writeFileSync(`${dir}/index.js.flow`, flowIndex);
  })
);

const base = path.join(__dirname, 'packages');
const srcBinGlob = './packages/*/src/bin/*';
const transformSrc = ({ glob, map }: {| glob: string, map: any |}) => gulp
  .src(glob, { base })
  .pipe(
    plumber({
      errorHandler: (err) => {
        gutil.log(err.stack);
      },
    })
  )
  .pipe(newer({ dest: base, map }))
  .pipe(
    through.obj((file, enc, callback) => {
      // eslint-disable-next-line
      file.path = path.resolve(
        file.base,
        swapSrcWithDist(file.relative),
      );
      callback(null, file);
    })
  );

gulp.task('build:bin', () =>
  transformSrc({ glob: srcBinGlob, map: swapSrcWithDist })
    .pipe(gulpBabel(getBabelConfig({ modules: 'commonjs' })))
    .pipe(gulp.dest(base)),
);

gulp.task('build', ['build:dist', 'build:bin', 'build:flow']);
