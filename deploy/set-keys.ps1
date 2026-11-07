# Put optional data-provider keys on the server. You type them here, so they never enter chat, files or git.
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
if (-not $fsq -and -not $ors) { Write-Host "Nothing to do."; exit 0 }

$script = @"
cd /home/azureuser/StrataIQ/deploy
set_key() { [ -z "`$2" ] && return; sed -i "/^`$1=/d" .env; echo "`$1=`$2" >> .env; }
set_key FSQ_API_KEY '$fsq'
set_key ORS_API_KEY '$ors'
chmod 600 .env
docker compose up -d api >/dev/null 2>&1
grep -c -E '^(FSQ_API_KEY|ORS_API_KEY)=' .env
"@

& $az vm run-command invoke -g strataiq -n strataiq-vm --command-id RunShellScript --scripts $script --query "value[0].message" -o tsv
Write-Host "Done. The number above is how many keys the server now has."
