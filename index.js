'use strict';

const {
  readInput, writeOutput, getMemoryUsageMessage, elapsedTime, parseLine
} = require('./utils');

const [filePath, outputToStdout = 1, debug = 0] = process.argv.slice(2);

if (!filePath || isNaN(outputToStdout) || isNaN(debug)) {
  console.info(`Usage:
  node index.js <input-file-path> [output-to-stdout] [debug]

Options:
  input-file-path   The path of the input data set.
  output-to-stdout  Write the insights to stdout (1) or file (0) [default: 1].
  debug             Write memory usage and elapsed time information to stdout [default: 0].

Examples:
  node index.js data/a.txt
    This will parse the given input data set (data/a.txt)
    with its submission (data/a.txt.out.txt) then evaluate and
    print the insights to the stdout.

  node index.js data/d.txt 0
    This will parse the given input data set (data/d.txt)
    with its submission (data/d.txt.out.txt) then evaluate and
    create a file (data/d.txt.insights.txt) containing insights.
`);
  return;
}

const elapsed = elapsedTime(+debug);
const dataset = {
  simulation: {
    duration: 0,
    numIntersections: 0,
    numStreets: 0,
    numCars: 0,
    bonusPoint: 0,
  },
  streets: {},
  cars: [],
};
const intersectionSchedulesById = {};
const averageIntersectionSchedules = {
  greenCycles: 0,
  totalCycles: 0,
};

function parseInputDataSet(data) {
  const lines = data.split('\n');
  const [
    simulationDuration, numIntersections, numStreets, numCars, bonusPoint
  ] = parseLine(lines.shift(), [0, 1, 2, 3, 4]);

  dataset.simulation.duration = simulationDuration;
  dataset.simulation.numIntersections = numIntersections;
  dataset.simulation.numStreets = numStreets;
  dataset.simulation.numCars = numCars;
  dataset.simulation.bonusPoint = bonusPoint;

  for (let i = 0; i < numStreets; i++) {
    const [start, end, streetName, duration] = parseLine(lines[i], [0, 1, 3]);

    dataset.streets[streetName] = { start, end, duration, carIdQueue: [] };
  }

  for (let i = numStreets; i < numStreets + numCars; i++) {
    const [carNumStreets, ...streetNames] = parseLine(lines[i], [0]);

    dataset.cars.push({
      numStreets: carNumStreets,
      streetNames,
      currentStreetIdx: 0,
      remainingTimeOnStreet: 0,
      arrived: false,
      score: 0,
      commuteTime: 0,
    });

    dataset.streets[streetNames[0]].carIdQueue.push(i - numStreets);
  }
}

function parseSubmittedDataSet(data) {
  const lines = data.split('\n');
  const numIntersections = +lines.shift();
  let numSchedules = 0;
  let currentLine = 0;

  for (let i = 0; i < numIntersections; i++) {
    const intersectionId = lines[currentLine + i];
    const numIncomingStreets = lines[currentLine + i + 1];

    if (typeof numIncomingStreets === 'undefined') {
      throw new Error([
        'Submission file has fewer lines than expected',
        `Unexpected EOF (end of file) at line ${currentLine + i + 2}`,
      ].join('. '));
    }

    if (isNaN(numIncomingStreets)) {
      throw new Error(
        `Invalid number of elements found at line ${currentLine + i + 3}`
      );
    }

    if (intersectionSchedulesById[intersectionId]) {
      throw new Error(
        `More than one adjustment was provided for intersection ${intersectionId}.`
      );
    }

    intersectionSchedulesById[intersectionId] = {};
    numSchedules += +numIncomingStreets;

    let lastScheduleTime = 0;

    for (let j = 0; j < +numIncomingStreets; j++) {
      const [streetName, schedule] = parseLine(lines[currentLine + i + 2 + j], [1]);

      if (
        dataset.streets[streetName] &&
        dataset.streets[streetName].end !== +intersectionId
      ) {
        throw new Error([
          `The schedule of intersection ${intersectionId} refers to street`,
          `${streetName}, but that street does not enter this intersection,`,
          'so it cannot be part of the intersection schedule.',
        ].join(' '));
      }

      if (isNaN(schedule)) {
        throw new Error([
          `The schedule of street ${streetName} has a duration for green light`,
          `that is not a number: ${schedule}.`,
        ].join(' '));
      }

      if (schedule < 1 || schedule > dataset.simulation.duration) {
        throw new Error([
          `The schedule of street ${streetName} should have duration`,
          `for green light that is between 1 and ${dataset.simulation.duration}.`,
        ].join(' '));
      }

      intersectionSchedulesById[intersectionId][streetName] = [
        lastScheduleTime, lastScheduleTime + schedule - 1
      ];
      lastScheduleTime += schedule;

      averageIntersectionSchedules.totalCycles += schedule;
    }

    intersectionSchedulesById[intersectionId].scheduledTimeWindow = lastScheduleTime;
    currentLine += +numIncomingStreets + 1;
  }

  averageIntersectionSchedules.greenCycles = averageIntersectionSchedules.totalCycles / numSchedules;
  averageIntersectionSchedules.totalCycles /= dataset.simulation.numIntersections;
}

function simulate() {
  let remainingTime = dataset.simulation.duration + 1;
  let time = 0;

  while (remainingTime--) {
    const isIntersectionCrossedInThisIteration = {};

    for (let i = 0; i < dataset.simulation.numCars; i++) {
      const car = dataset.cars[i];

      if (car.arrived) {
        continue;
      }

      if (
        car.remainingTimeOnStreet === 1 &&
        car.currentStreetIdx < car.numStreets - 1
      ) {
        const streetName = car.streetNames[car.currentStreetIdx];

        dataset.streets[streetName].carIdQueue.push(i);
      }

      if (car.remainingTimeOnStreet > 0) {
        car.remainingTimeOnStreet--;
      }

      if (car.remainingTimeOnStreet === 0) {
        if (car.currentStreetIdx === car.numStreets - 1) {
          car.arrived = true;
          car.score = dataset.simulation.bonusPoint + remainingTime;
          car.commuteTime = time;
          continue;
        }

        if (remainingTime === 0) {
          continue;
        }

        const streetName = car.streetNames[car.currentStreetIdx];
        const { end, carIdQueue } = dataset.streets[streetName];
        let isTrafficLightGreen = false;

        if (intersectionSchedulesById[end] && intersectionSchedulesById[end][streetName]) {
          const timePart = time % intersectionSchedulesById[end].scheduledTimeWindow;
          const [gte, lte] = intersectionSchedulesById[end][streetName];

          isTrafficLightGreen = gte <= timePart && lte >= timePart;
        }

        if (
          !isTrafficLightGreen ||
          isIntersectionCrossedInThisIteration[streetName] ||
          carIdQueue[0] !== i
        ) {
          continue;
        }

        isIntersectionCrossedInThisIteration[streetName] = true;
        carIdQueue.shift();

        const { duration } = dataset.streets[
          car.streetNames[++car.currentStreetIdx]
        ];

        car.remainingTimeOnStreet = duration;
      }
    }

    time++;
  }
}

function createInsights() {
  const noColor = +outputToStdout === 0;
  const yellow = value => noColor ? value : `\u001B[33m${value}\u001B[0m`;
  const formatNumber = value => yellow(value.toLocaleString('en-US'));
  const toPercentage = value => yellow(`${(value * 100).toFixed(0)}%`);

  const { numIntersections, numCars, bonusPoint } = dataset.simulation;
  const arrivedCars = dataset.cars
    .filter(car => car.arrived)
    .sort((a, b) => a.commuteTime - b.commuteTime);
  const numArrivedCars = arrivedCars.length;
  const score = arrivedCars.reduce((sum, car) => sum + car.score, 0);
  const earlyArrivalBonus = arrivedCars.reduce((sum, car) =>
    sum + (car.score - bonusPoint), 0
  );
  const averageCommuteTime = (arrivedCars.reduce(
    (sum, car) => sum + car.commuteTime, 0
  ) / numArrivedCars).toFixed(2);

  const arrivedCarsInsights = [
    `${formatNumber(numArrivedCars)} of ${formatNumber(numCars)}`,
    `cars arrived before the deadline (${toPercentage(numArrivedCars / numCars)}).`,
  ];

  if (arrivedCars.length) {
    arrivedCarsInsights.push(...[
      `The earliest car arrived at its destination after ${formatNumber(arrivedCars[0].commuteTime)}`,
      `seconds scoring ${formatNumber(arrivedCars[0].score)} points, whereas the last`,
      `car arrived at its destination after ${formatNumber(arrivedCars[numArrivedCars - 1].commuteTime)}`,
      `seconds scoring ${formatNumber(arrivedCars[numArrivedCars - 1].score)} points.`,
      `Cars that arrived within the deadline drove for an average of ${formatNumber(averageCommuteTime)}`,
      'seconds to arrive at their destination.',
    ]);
  }

  return [
    [
      `The submission scored ${formatNumber(score)} points. This is the sum of`,
      `${formatNumber(bonusPoint * numArrivedCars)} bonus points`,
      `for cars arriving before the deadline (${formatNumber(bonusPoint)}`,
      `points each) and ${formatNumber(earlyArrivalBonus)} points for early arrival times.`,
    ].join(' '),
    arrivedCarsInsights.join(' '),
    [
      `The schedules for the ${formatNumber(numIntersections)}`,
      'traffic lights had an average total cycle length of',
      `${yellow(averageIntersectionSchedules.totalCycles.toFixed(2))} seconds.`,
      'A traffic light that turned green was scheduled to stay green for',
      `${yellow(averageIntersectionSchedules.greenCycles.toFixed(2))} seconds on average.`,
      '\n',
    ].join(' '),
  ].join('\n\n');
}

function evaluate([inputDataSet, submittedDataSet]) {
  parseInputDataSet(inputDataSet);
  parseSubmittedDataSet(submittedDataSet);
  simulate();

  return createInsights();
}

Promise.all([readInput(filePath), readInput(`${filePath}.out.txt`)])
  .then(evaluate)
  .then(output => +outputToStdout
    ? (console.info(output), Promise.resolve())
    : writeOutput(`${filePath}.insights.txt`, output)
  )
  .then(() => elapsed.log(`${getMemoryUsageMessage()}\n\nElapsed time`).reset())
  .catch(console.error);
