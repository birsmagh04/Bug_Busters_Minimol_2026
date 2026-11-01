const { spawn } = require('child_process');

const electronBinary = require('electron');
const electronArgs = ['.', ...process.argv.slice(2)];
const electronEnv = { ...process.env };
delete electronEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, electronArgs, {
  env: electronEnv,
  stdio: 'inherit',
  windowsHide: false
});

child.on('error', (error) => {
  console.error('Failed to launch the HiveNet desktop app:', error.message);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
