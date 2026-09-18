/**
 * 扩展打包脚本
 *
 * 产出两种用途不同的压缩包，二者**不可混用**：
 *
 *  1. chrome-extension（本地加载 / GitHub Release 分发）
 *     保留 manifest 的 `key` 字段。该字段把扩展 ID 固定下来，使本地以
 *     「加载已解压的扩展程序」安装时 ID 稳定 —— 否则每次重装 ID 变化，
 *     chrome.storage 与 IndexedDB 会按新 ID 重新分配，用户数据看起来「丢了」。
 *
 *  2. store（Chrome Web Store / Edge Add-ons 提交）
 *     必须**剥离** `key`。商店用自己的密钥签名并分配固定 ID，上传包中出现
 *     `key` 会被直接拒绝，报「清单不应包含 key 字段」。
 *
 * 历史上两个包靠手工区分，v1.3.0 就把含 key 的包传给了商店导致校验失败。
 * 因此这里把差异固化为 `--target` 参数，避免再次拿错。
 *
 * 用法：
 *   node scripts/package-extension.mjs                # 两个包都出
 *   node scripts/package-extension.mjs --target store # 只出商店包
 *
 * 前置条件：先执行 `npm run build` 生成 dist/。
 */
import { crc32, deflateRawSync } from 'node:zlib';
import { createWriteStream, existsSync, readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(projectRoot, 'dist');
const manifestPath = join(distDir, 'manifest.json');
const stagingDir = join(projectRoot, '.package-staging');

/** 商店提交包中必须移除的字段（扩展 ID 由商店签名取代） */
const STORE_FORBIDDEN_MANIFEST_KEYS = ['key', 'update_url'];

/** 统一用正斜杠：ZIP 规范要求，反斜杠会让 Chrome 无法解析包内路径 */
const toZipPath = (p) => p.split(sep).join('/');

/** 递归收集目录下所有文件 */
async function collectFiles(root, base = root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full, base)));
    } else {
      files.push({ full, name: toZipPath(relative(base, full)) });
    }
  }
  return files;
}

/**
 * 手写 ZIP。项目没有打包期依赖（jszip / archiver 均未安装），而 Node 内置的
 * zlib 已提供 crc32 与 deflateRawSync，足够写出合规 ZIP，不必为此新增依赖。
 *
 * 时间戳固定为 1980-01-01，使同一份 dist 每次打包产出字节级一致的包，
 * 便于比对与校验。
 */
function buildEntry(name, data) {
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data) >>> 0;
  const compressed = deflateRawSync(data, { level: 9 });

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // 本地文件头签名
  local.writeUInt16LE(20, 4); // 解压所需版本
  local.writeUInt16LE(0x0800, 6); // 标志位：文件名 UTF-8
  local.writeUInt16LE(8, 8); // 压缩方式 deflate
  local.writeUInt16LE(0, 10); // 修改时间
  local.writeUInt16LE(0x21, 12); // 修改日期 1980-01-01
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28); // 额外字段长度

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // 中央目录签名
  central.writeUInt16LE(20, 4); // 创建版本
  central.writeUInt16LE(20, 6); // 解压所需版本
  central.writeUInt16LE(0x0800, 8); // 标志位
  central.writeUInt16LE(8, 10); // 压缩方式
  central.writeUInt16LE(0, 12); // 修改时间
  central.writeUInt16LE(0x21, 14); // 修改日期
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30); // 额外字段长度
  central.writeUInt16LE(0, 32); // 注释长度
  central.writeUInt16LE(0, 34); // 起始磁盘号
  central.writeUInt16LE(0, 36); // 内部属性
  central.writeUInt32LE(0, 38); // 外部属性

  return {
    localHeader: Buffer.concat([local, nameBuf]),
    compressed,
    centralHeader: Buffer.concat([central, nameBuf]),
  };
}

async function writeZip(outPath, files) {
  const body = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const entry = buildEntry(file.name, await readFile(file.full));
    // 中央目录第 42 字节记录该条目相对文件起点的偏移，必须回填
    entry.centralHeader.writeUInt32LE(offset, 42);
    body.push(entry.localHeader, entry.compressed);
    central.push(entry.centralHeader);
    offset += entry.localHeader.length + entry.compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // 中央目录结尾签名
  end.writeUInt16LE(files.length, 8); // 本磁盘条目数
  end.writeUInt16LE(files.length, 10); // 总条目数
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16); // 中央目录起始偏移

  await new Promise((resolve, reject) => {
    const stream = createWriteStream(outPath);
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.write(Buffer.concat(body));
    stream.write(centralBuf);
    stream.end(end);
  });
}

/** 复制 dist 到暂存目录，并剥离商店禁止的 manifest 字段 */
async function stageForStore() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const removed = STORE_FORBIDDEN_MANIFEST_KEYS.filter((k) => k in manifest);
  for (const key of removed) delete manifest[key];

  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });
  await writeFile(
    join(stagingDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );

  for (const file of await collectFiles(distDir)) {
    if (file.name === 'manifest.json') continue;
    const target = join(stagingDir, file.name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(file.full, target);
  }

  return removed;
}

async function main() {
  const flagIndex = process.argv.indexOf('--target');
  const target = flagIndex !== -1 ? process.argv[flagIndex + 1] : 'all';
  if (!['all', 'local', 'store'].includes(target)) {
    console.error(`未知的 --target 取值：${target}（可选 local / store / all）`);
    process.exit(1);
  }
  if (!existsSync(manifestPath)) {
    console.error('未找到 dist/manifest.json —— 请先运行 `npm run build`。');
    process.exit(1);
  }

  const version = JSON.parse(readFileSync(manifestPath, 'utf8')).version;
  const results = [];

  console.log(`打包 CrabTab v${version}`);

  if (target === 'all' || target === 'local') {
    const outPath = join(projectRoot, `CrabTab-v${version}-chrome-extension.zip`);
    await writeZip(outPath, await collectFiles(distDir));
    results.push({ outPath, kind: 'local' });
  }

  if (target === 'all' || target === 'store') {
    const removed = await stageForStore();
    const outPath = join(projectRoot, `CrabTab-v${version}-store.zip`);
    await writeZip(outPath, await collectFiles(stagingDir));
    await rm(stagingDir, { recursive: true, force: true });
    results.push({
      outPath,
      kind: 'store',
      note: removed.length ? `已剥离 ${removed.join(', ')}` : undefined,
    });
  }

  console.log();
  for (const r of results) {
    const label = r.kind === 'store' ? '商店提交' : '本地加载';
    const size = (statSync(r.outPath).size / 1024 / 1024).toFixed(2);
    const note = r.note ? `  (${r.note})` : '';
    console.log(`  ${relative(projectRoot, r.outPath)}  ${size} MB  — ${label}${note}`);
  }
  console.log();
  console.log('提交 Chrome Web Store / Edge Add-ons 请用 *-store.zip；');
  console.log('含 key 的 chrome-extension 包会被商店拒绝（「清单不应包含 key 字段」）。');
}

main().catch((err) => {
  console.error('打包失败：', err);
  process.exit(1);
});
