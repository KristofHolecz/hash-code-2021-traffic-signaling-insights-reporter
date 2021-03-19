'use strict';

const fs = require('fs');

function readInput(path, encoding = 'utf8') {
  return new Promise((resolve, reject) => {
    fs.readFile(path, encoding, (err, result) =>
      err ? reject(err) : resolve(result)
    );
  });
}

function writeOutput(path, data) {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, data, (err, result) =>
      err ? reject(err) : resolve(result)
    );
  });
}

function getMemoryUsageMessage() {
  const memoryUsage = process.memoryUsage();
  const message = Object.keys(memoryUsage)
    .map(key => (memoryUsage[key] / 1024 / 1024).toFixed(2))
    .join(' :: ');

  return [
    'Memory Usage (MiB):',
    'RSS :: Heap Total :: Heap Used :: External :: Array Buffers',
    message,
  ].join('\n');
}

function elapsedTime(debug = 1) {
  let start = process.hrtime.bigint();

  const timer = {
    log: message => {
      if (debug) {
        const diff = process.hrtime.bigint() - start;

        console.debug([
          message && `${message}:`,
          `${(diff / 1000000n).toLocaleString('en-US')}.${diff % 1000000n} ms`,
        ].join(' '));
      }

      return timer;
    },
    reset: () => {
      start = process.hrtime.bigint();
      return timer;
    }
  };

  return timer;
}

function parseLine(rawLine, stringToNumberArrayIndexes = []) {
  const parsedLine = rawLine.split(' ');

  return stringToNumberArrayIndexes.length
    ? parsedLine.map((value, i) =>
      stringToNumberArrayIndexes.includes(i) ? +value : value
    )
    : parsedLine;
}

module.exports = {
  readInput,
  writeOutput,
  getMemoryUsageMessage,
  elapsedTime,
  parseLine,
};
