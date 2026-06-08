import { spawn } from 'child_process';

export async function copyToClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    let cmd: string;
    let args: string[] = [];

    if (process.platform === 'win32') {
      cmd = 'clip';
    } else if (process.platform === 'darwin') {
      cmd = 'pbcopy';
    } else {
      cmd = 'xclip';
      args = ['-selection', 'clipboard'];
    }

    const proc = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
    proc.stdin.write(text);
    proc.stdin.end();
  });
}
