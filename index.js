const fs = require("fs");
const yargs = require("yargs");
const Disector = require("./lib/Disector.js");

const main = async yargs => {
  const argv = yargs
    .boolean("show")
    .describe("show", "Run Chrome in headful-mode")
    .alias("s", "show")
    .array("devices")
    .describe("devices", "List of devices to test modifications against")
    .default("devices", ["Desktop", "Galaxy Note 3", "iPad Pro landscape"])
    .array("phase")
    .default("phase", ["node", "attr"])
    .alias("p", "phase")
    .nargs("phase", 1)
    .describe("out", "Output file")
    .alias("o", "out")
    .boolean("overwrite")
    .alias("O", "overwrite")
    .describe("overwrite", "Overwrite input file")
    .help("h")
    .alias("h", "help").argv;

  if (argv.overwrite && !argv.out) {
    argv.out = argv._[0];
  }

  const source = fs.readFileSync(argv._[0], "utf8");

  const disector = new Disector(source, {
    name: argv._[0],
    headless: !argv.show,
    phases: argv.phase,
    deviceNames: argv.devices
  });

  let exitCode = 0;

  try {
    const output = await disector.process();

    if (argv.out) {
      fs.writeFileSync(argv.out, output);
    } else {
      console.log(output);
    }
  } catch (e) {
    console.error("Error: ", e);
    exitCode = 1;
  } finally {
    disector.close();
  }

  process.exit(exitCode);
};

(async () => {
  await main(yargs);
  return 0;
})();
