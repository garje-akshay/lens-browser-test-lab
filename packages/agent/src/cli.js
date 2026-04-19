const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const { LOG_DIR } = require('./paths');
const runtime = require('./runtime');

const program = new Command();

program
  .name('lens-agent')
  .description('Run the Lens device backend + ws-scrcpy + tunnel on your machine')
  .version('0.1.7');

program
  .command('start')
  .description('Start backend, ws-scrcpy, and a cloudflared quick tunnel')
  .option('-q, --quiet', 'suppress progress output')
  .action(async (opts) => {
    try {
      await runtime.start({ quiet: opts.quiet });
    } catch (e) {
      console.error(`[lens] ${e.message}`);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop all child processes started by the agent')
  .action(async () => {
    await runtime.stop();
  });

program
  .command('status')
  .description('Show tunnel URL and per-process health')
  .action(() => runtime.status());

program
  .command('url')
  .description('Print the current tunnel URL (for piping)')
  .action(() => runtime.url());

program
  .command('logs')
  .description('Tail logs for backend / ws-scrcpy / tunnel')
  .option('-n, --name <name>', 'backend | ws-scrcpy | tunnel', 'backend')
  .option('-f, --follow', 'follow the log (like tail -f)')
  .action((opts) => {
    const p = path.join(LOG_DIR, `${opts.name}.log`);
    if (!fs.existsSync(p)) {
      console.error(`No log at ${p}. Has the agent been started?`);
      process.exit(1);
    }
    if (opts.follow) {
      const { spawn } = require('child_process');
      spawn('tail', ['-f', p], { stdio: 'inherit' });
    } else {
      process.stdout.write(fs.readFileSync(p, 'utf8'));
    }
  });

program
  .command('doctor')
  .description('Check that required external binaries are installed')
  .action(async () => {
    const missing = await runtime.checkPrereqs();
    if (!missing.length) {
      console.log('All prerequisites installed.');
      return;
    }
    console.error(`Missing: ${missing.join(', ')}`);
    console.error('Install with: brew install android-platform-tools cloudflared node');
    process.exit(1);
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});
