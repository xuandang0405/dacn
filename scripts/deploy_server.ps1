param(
    [ValidateSet('Setup', 'Up', 'Down', 'Status', 'Logs')]
    [string]$Action = 'Up',
    [string]$PublicUrl = '',
    [ValidateRange(1, 65535)]
    [int]$HttpPort = 8080
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $root '.env.server'
$explicitPort = $PSBoundParameters.ContainsKey('HttpPort')

function New-RandomHex([int]$Count) {
    $bytes = New-Object byte[] $Count
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}

function Initialize-Config {
    if (Test-Path -LiteralPath $configPath) {
        Write-Host 'Existing .env.server preserved. Edit it directly to change server settings.'
        return
    }
    if ([string]::IsNullOrWhiteSpace($PublicUrl)) {
        $script:PublicUrl = Read-Host 'Public website URL (example http://192.168.1.50:8080)'
    }
    $uri = $null
    if (-not [Uri]::TryCreate($PublicUrl, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -notin @('http', 'https') -or $uri.AbsolutePath -ne '/' -or
        $uri.Query -or $uri.Fragment -or $uri.UserInfo) {
        throw 'Use an http/https origin without a path, query or credentials.'
    }
    $publicOrigin = $uri.GetLeftPart([UriPartial]::Authority)
    $listenPort = if (-not $explicitPort -and $uri.Scheme -eq 'http') { $uri.Port } else { $HttpPort }
    $values = @{
        PUBLIC_URL = $publicOrigin
        PUBLIC_SCHEME = $uri.Scheme
        HTTP_PORT = [string]$listenPort
        MYSQL_ROOT_PASSWORD = New-RandomHex 24
        MYSQL_PASSWORD = New-RandomHex 24
        JWT_SECRET = New-RandomHex 48
        DEMO_PASSWORD = New-RandomHex 16
    }
    $lines = foreach ($line in Get-Content -LiteralPath (Join-Path $root '.env.server.example')) {
        $key = ($line -split '=', 2)[0]
        if ($values.ContainsKey($key)) { $key + '=' + $values[$key] } else { $line }
    }
    $bytes = (New-Object System.Text.UTF8Encoding $false).GetBytes(($lines -join "`n") + "`n")
    $stream = [IO.File]::Open($configPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    Write-Host 'Created private .env.server with random database/JWT/demo passwords.'
    Write-Host 'Set GEMINI_API_KEY and SMTP settings in that file if needed. Secrets were not printed.'
}

Push-Location -LiteralPath $root
try {
    if ($Action -in @('Setup', 'Up')) { Initialize-Config }
    if ($Action -eq 'Setup') { exit 0 }
    if (-not (Test-Path -LiteralPath $configPath)) { throw 'Run setup first to create .env.server.' }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI is not installed or not on PATH.' }
    $engine = & docker info --format '{{.OSType}}' 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Docker engine is not running. Start the Linux Docker engine and retry.' }
    if (($engine -join '').Trim() -ne 'linux') {
        throw 'This app requires Linux containers. A Windows-only container engine cannot run these images. See server/README_WINDOWS.md.'
    }
    & docker compose version --short
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is required.' }
    $compose = @('compose', '--env-file', $configPath, '-f', (Join-Path $root 'server/compose.yml'))
    & docker @compose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Invalid server configuration. Check .env.server.' }
    switch ($Action) {
        'Up' { & docker @compose up -d --build --wait --wait-timeout 300 }
        'Down' { & docker @compose down }
        'Status' { & docker @compose ps -a }
        'Logs' { & docker @compose logs --tail 150 -f gateway backend initialize scheduler }
    }
    if ($LASTEXITCODE -ne 0) { throw ('Docker operation failed. Run logs-server.bat for details.') }
    if ($Action -eq 'Up') {
        $url = Get-Content -LiteralPath $configPath | Where-Object { $_ -match '^PUBLIC_URL=' } | Select-Object -First 1
        Write-Host ('Website: ' + ($url -replace '^PUBLIC_URL=', ''))
        Write-Host 'Data persists in named Docker volumes. Stop with stop-server.bat; do not remove volumes.'
    }
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally { Pop-Location }
