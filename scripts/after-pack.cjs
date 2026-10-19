// electron-builder afterPack hook.
//
// macOS: Pegel has no Apple Developer ID (v1), so electron-builder does not
// sign it. Apps on Apple Silicon must carry at least an ad-hoc signature,
// otherwise macOS refuses to start them ("damaged"). Sign the packed app
// ad-hoc before the DMG is created.
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`[after-pack] ad-hoc signing ${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
