# File: build-native.ps1
# Purpose: Build the real C++/gateway/HMI/Electron Windows application into a fresh portable folder.
# Symbols and important variables are indexed in docs/generated/symbol-index.md.
param([string]$Output = 'release/windows')
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskRelease = [IO.Path]::GetFullPath((Join-Path $taskRoot 'release'))
$taskOutput = [IO.Path]::GetFullPath((Join-Path $taskRoot $Output))
if (-not $IsWindows -or -not $taskOutput.StartsWith($taskRelease + [IO.Path]::DirectorySeparatorChar) -or (Test-Path -LiteralPath $taskOutput)) {
    throw 'Use a fresh Windows output below release; existing packages are preserved.'
}
$taskVswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$taskVs = (& $taskVswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
if ($LASTEXITCODE -ne 0 -or -not $taskVs) { throw 'A build-only MSVC C++ toolchain is required.' }
$taskCmake = Join-Path $taskVs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe'
$taskCtest = Join-Path $taskVs 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/ctest.exe'
$taskDeveloper = Join-Path $taskVs 'Common7/Tools/VsDevCmd.bat'
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Build tool failed: $([IO.Path]::GetFileName($Program))" }
}
$taskOldOutput = $env:TWIN_PACKAGE_OUTPUT
Push-Location $taskRoot
try {
    New-Item -ItemType Directory -Path .runtime -Force | Out-Null
    $taskPackage = Get-Content package.json -Raw | ConvertFrom-Json
    if ($taskPackage.version -ne '1.1.0' -or $taskPackage.devDependencies.electron -ne '44.11.0') { throw 'Reviewed product/runtime versions required.' }
    $taskCommand = '"' + $taskDeveloper + '" -arch=x64 -host_arch=x64 && "' + $taskCmake + '" -S . -B .runtime/native-kernel -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded && "' + $taskCmake + '" --build .runtime/native-kernel && "' + $taskCtest + '" --test-dir .runtime/native-kernel --output-on-failure'
    Invoke-Checked 'cmd.exe' @('/d', '/s', '/c', $taskCommand)
    Invoke-Checked 'node_modules/.bin/tsc.cmd' @('-p', 'desktop/tsconfig.json')
    Invoke-Checked 'node_modules/.bin/vite.cmd' @('build', '--config', 'hmi/vite.config.ts')
    $taskSource = (& git -c "safe.directory=$($taskRoot.Replace('\','/'))" rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $taskSource -notmatch '^[a-f0-9]{40}$') { throw 'Source identity required.' }
    $taskDirty = [bool](& git -c "safe.directory=$($taskRoot.Replace('\','/'))" status --porcelain)
    [IO.File]::WriteAllText((Join-Path $taskRoot '.runtime/package-source.json'),
        (@{version='1.1.0';source=$taskSource;sourceDirty=$taskDirty} | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
    $env:TWIN_PACKAGE_OUTPUT = $taskOutput
    Invoke-Checked 'node_modules/.bin/electron-builder.cmd' @('--config', 'electron-builder.config.cjs', '--win', 'dir', '--x64', '--publish', 'never')
    $taskVersion = (Get-Item -LiteralPath (Join-Path $taskOutput 'win-unpacked/IndustrialEdgeDigitalTwin.exe')).VersionInfo
    if ($taskVersion.CompanyName -ne 'Jason Stys' -or $taskVersion.FileVersion -ne '1.1.0') { throw 'Actual Windows executable author/version metadata mismatch.' }
    Write-Output 'Built full unsigned portable app; native acceptance and publication remain required.'
} finally { $env:TWIN_PACKAGE_OUTPUT = $taskOldOutput; Pop-Location }
