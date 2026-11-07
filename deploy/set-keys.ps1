# Put optional provider keys on the server. You type them here, so they never enter chat, files or git.
#   powershell -ExecutionPolicy Bypass -File deploy\set-keys.ps1
$az = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"

function Read-Key($label) {
    $secure = Read-Host "$label (leave empty to skip)" -AsSecureString
    $key = [Net.NetworkCredential]::new("", $secure).Password
    if ($key -and $key -notmatch '^[A-Za-z0-9._=+/-]+$') { throw "$label has unexpected characters" }
    return $key
}

$fsq = Read-Key "Foursquare key"
$ors = Read-Key "openrouteservice key"
$speko = Read-Key "Speko key"
if (-not $fsq -and -not $ors -and -not $speko) { Write-Host "Nothing to do."; exit 0 }

$script = @"
cd /home/azureuser/StrataIQ/deploy
set_key() { [ -z "`$2" ] && return; sed -i "/^`$1=/d" .env; echo "`$1=`$2" >> .env; }
set_key FSQ_API_KEY '$fsq'
set_key ORS_API_KEY '$ors'
set_key SPEKO_API_KEY '$speko'
if grep -q '^SPEKO_API_KEY=' .env; then set_key VOICE 1; fi
chmod 600 .env
docker compose up -d --build api web >/dev/null 2>&1
grep -c -E '^(FSQ_API_KEY|ORS_API_KEY|SPEKO_API_KEY)=' .env
"@

# A file keeps the script's quotes intact on the way to Azure; it is deleted straight after.
$file = [IO.Path]::GetTempFileName()
try {
    [IO.File]::WriteAllText($file, ($script -replace "`r", ""))
    & $az -IBm azure.cli vm run-command invoke -g strataiq -n strataiq-vm --command-id RunShellScript --scripts "@$file" --query "value[0].message" -o tsv
} finally {
    Remove-Item $file -Force
}
Write-Host "Done. The number above is how many keys the server now has."
