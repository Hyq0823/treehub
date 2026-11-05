$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dist = Join-Path $repoRoot 'minitool\dist'
$artifacts = Join-Path $repoRoot 'minitool\artifacts'
$zipPath = Join-Path $artifacts 'personality-tree-minitool.zip'

Push-Location $repoRoot
try {
  node .\minitool\scripts\build.cjs
  if ($LASTEXITCODE -ne 0) { throw '小工具构建失败' }
  node .\.agents\skills\minitool-zip-builder\scripts\write_manifest.mjs .\minitool\dist false
  if ($LASTEXITCODE -ne 0) { throw 'mini_tool.json 生成失败' }
  New-Item -ItemType Directory -Force $artifacts | Out-Null
  Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
  Push-Location $dist
  try {
    tar.exe -a -c -f $zipPath *
    if ($LASTEXITCODE -ne 0) { throw 'ZIP 打包失败' }
  } finally {
    Pop-Location
  }
  $entries = @(tar.exe -tf $zipPath)
  if ($entries -match '\\') { throw 'ZIP 内检测到反斜杠路径' }
  if ($entries -notcontains 'index.html') { throw 'ZIP 根目录缺少 index.html' }
  node .\.agents\skills\minitool-zip-builder\scripts\audit_artifact.mjs $zipPath
  if ($LASTEXITCODE -ne 0) { throw 'ZIP 审计失败' }
  Write-Host "打包完成：$zipPath"
} finally {
  Pop-Location
}
