// npm run dist [-- --profile=<name>] [further electron-builder arguments]
//
// Builds Pegel and the installer. With a profile (build-profiles/<name>.json,
// or PEGEL_PROFILE=<name>) the start theme is
// bundled as resources/profile.json and the installer name gets the profile.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const profileArg = args.find((a) => a.startsWith('--profile='));
const name = (profileArg?.split('=')[1] ?? process.env.PEGEL_PROFILE ?? '').trim();
const builderArgs = args.filter((a) => a !== profileArg);

function fail(message) {
  console.error(`\n[dist] ${message}\n`);
  process.exit(1);
}

let profile = {};
if (name) {
  if (!/^[a-z0-9_-]+$/i.test(name))
    fail(`Ungültiger Profilname „${name}“ (erlaubt: a–z, 0–9, - und _).`);
  const file = join(root, 'build-profiles', `${name}.json`);
  if (!existsSync(file)) fail(`Profil nicht gefunden: build-profiles/${name}.json`);
  try {
    profile = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`build-profiles/${name}.json ist kein gültiges JSON: ${error.message}`);
  }
  const allowed = new Set(['defaultTheme']);
  const unknown = Object.keys(profile).filter((k) => !allowed.has(k));
  if (unknown.length)
    fail(`Unbekannte Felder in build-profiles/${name}.json: ${unknown.join(', ')}`);
  for (const key of allowed) {
    if (key in profile && typeof profile[key] !== 'string') fail(`„${key}“ muss ein Text sein.`);
  }
  console.log(`[dist] Profil „${name}“: ${JSON.stringify(profile)}`);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm run build', [], { shell: true });

// Next to the app (extraResources), read by src/main/profile.ts. Empty without a profile.
writeFileSync(join(root, 'out', 'profile.json'), JSON.stringify(profile, null, 2));

if (name) {
  builderArgs.push(
    `--config.nsis.artifactName=Pegel-Setup-\${version}-${name}.\${ext}`,
    `--config.dmg.artifactName=Pegel-\${version}-${name}-\${arch}.\${ext}`,
  );
}
// Called without a shell so "${version}" reaches electron-builder unexpanded.
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('electron-builder/package.json')), 'out', 'cli', 'cli.js');
run(process.execPath, [cli, ...builderArgs]);
