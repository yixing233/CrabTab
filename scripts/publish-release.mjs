import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
const version = pkg.version;
const tagName = `v${version}`;
const releaseName = `CrabTab v${version}`;

// 1. 获取 GitHub Token
async function getGithubToken() {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', ['credential', 'fill'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.on('close', code => {
      const passLine = out.split('\n').find(l => l.startsWith('password='));
      if (!passLine) {
        reject(new Error('未在 Git 凭据管理器中找到 GitHub 访问令牌'));
        return;
      }
      resolve(passLine.replace('password=', '').trim());
    });
    proc.stdin.write('protocol=https\nhost=github.com\n\n');
  });
}

// 2. 提取 CHANGELOG.md 中该版本的正文
function getReleaseBody() {
  const changelog = readFileSync(join(projectRoot, 'CHANGELOG.md'), 'utf8');
  const startMarker = `## [${tagName}]`;
  const startIndex = changelog.indexOf(startMarker);
  if (startIndex === -1) {
    return '发布新版本 ' + tagName;
  }
  const afterStart = changelog.slice(startIndex);
  const nextMarkerIndex = afterStart.indexOf('\n---', 1);
  const block = nextMarkerIndex !== -1 ? afterStart.slice(0, nextMarkerIndex) : afterStart;
  
  // 移除版本标题行（## [v1.3.2] - 2026-09-24）
  const lines = block.split('\n');
  return lines.slice(1).join('\n').trim();
}

async function main() {
  const token = await getGithubToken();
  const body = getReleaseBody();
  const repo = 'yixing233/CrabTab';

  console.log(`准备为 ${repo} 发布 Release ${tagName}...`);

  const headers = {
    'User-Agent': 'CrabTab-Release-Script',
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  };

  // 检查是否已存在
  let release;
  const checkRes = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tagName}`, { headers });
  if (checkRes.status === 200) {
    release = await checkRes.json();
    console.log(`Release ${tagName} 已存在，准备上传或补充资源...`);
  } else {
    // 创建 Release
    const createRes = await fetch(`https://api.github.com/repos/${repo}/releases`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tagName,
        target_commitish: 'main',
        name: releaseName,
        body: body,
        draft: false,
        prerelease: false
      })
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`创建 Release 失败 (${createRes.status}): ${err}`);
    }
    release = await createRes.json();
    console.log(`Release 创建成功: ${release.html_url}`);
  }

  // 上传 Assets
  const assets = [
    `CrabTab-${tagName}-chrome-extension.zip`,
    `CrabTab-${tagName}-store.zip`
  ];

  for (const assetName of assets) {
    const filePath = join(projectRoot, assetName);
    const existing = release.assets?.find(a => a.name === assetName);
    if (existing) {
      console.log(`文件 ${assetName} 已存在，跳过上传。`);
      continue;
    }

    console.log(`正在上传 ${assetName}...`);
    const uploadUrl = release.upload_url.replace('{?name,label}', `?name=${encodeURIComponent(assetName)}`);
    
    try {
      execFileSync('curl.exe', [
        '-s', '-S',
        '-X', 'POST',
        '-H', `Authorization: token ${token}`,
        '-H', 'Content-Type: application/zip',
        '--proxy', 'http://127.0.0.1:7890',
        '--data-binary', `@${filePath}`,
        uploadUrl
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      console.log(`上传 ${assetName} 完成！`);
    } catch (e) {
      console.error(`上传 ${assetName} 失败:`, e.message);
    }
  }

  console.log(`\n🎉 发布全部完成！Release 访问地址:`);
  console.log(release.html_url);
}

main().catch(err => {
  console.error('发布流程发生错误:', err);
  process.exit(1);
});
