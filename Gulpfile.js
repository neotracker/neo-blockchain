/* @flow */
/* eslint-disable */
const plumber = require('gulp-plumber');
const through = require('through2');
const chalk = require('chalk');
const newer = require('gulp-newer');
const babel = require('gulp-babel');
const watch = require('gulp-watch');
const gutil = require('gulp-util');
const gulp = require('gulp');
const path = require('path');
const merge = require('merge-stream');

function swapSrcWithLib(srcPath) {
  const parts = srcPath.split(path.sep);
  parts[1] = 'lib';
  return parts.join(path.sep);
}

const sources = [
  ['packages', './packages/*/src/**/*.js', swapSrcWithLib],
  [
    'packages',
    './packages/*/src/bin/**/*',
    swapSrcWithLib,
  ],
].map(([source, glob, swap]) => [
  path.join(__dirname, source),
  glob,
  swap,
]);

gulp.task('default', ['build']);

gulp.task('build', function() {
  return merge(
    sources.map(([base, glob, swap]) => {
      return gulp
        .src(glob, { base: base })
        .pipe(
          plumber({
            errorHandler: function(err) {
              gutil.log(err.stack);
            },
          })
        )
        .pipe(
          newer({
            dest: base,
            map: swap,
          })
        )
        .pipe(
          through.obj(function(file, enc, callback) {
            gutil.log(`Compiling '${chalk.cyan(file.relative)}'...`);
            callback(null, file);
          })
        )
        .pipe(
          through.obj(function(file, enc, callback) {
            // Passing 'file.relative' because newer() above uses a relative
            // path and this keeps it consistent.
            file.path = path.resolve(
              file.base,
              swap(file.relative) + '.flow',
            );
            callback(null, file);
          })
        )
        .pipe(gulp.dest(base))
        .pipe(
          through.obj(function(file, enc, callback) {
            // Passing 'file.relative' because newer() above uses a relative
            // path and this keeps it consistent.
            file.path = file.path.slice(0, -('.flow'.length));
            callback(null, file);
          })
        )
        .pipe(babel())
        .pipe(gulp.dest(base));
    })
  );
});

gulp.task('watch', ['build'], function() {
  watch(sources.map(source => source[1]), { debounceDelay: 200 }, function() {
    gulp.start('build');
  });
});
