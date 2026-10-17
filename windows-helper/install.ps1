# Installs the Magppie WhatsApp helper for this Windows user. No admin rights needed.
$dir = Join-Path $env:LOCALAPPDATA "MagppieWA"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
# Stop an older copy that may be running.
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'MagppieWA\\helper.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Copy-Item -Force (Join-Path $PSScriptRoot "helper.ps1") (Join-Path $dir "helper.ps1")
$run = 'powershell.exe -STA -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $dir "helper.ps1") + '"'
# Start it now, and every time this user signs in to Windows.
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "MagppieWA" -Value $run
Start-Process powershell.exe -ArgumentList "-STA -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $dir 'helper.ps1')`"" -WindowStyle Hidden
# Let the CRM site talk to the helper on this PC without asking each time (Chrome and Edge).
$sites = @("https://magppie-crm-helper.vercel.app", "https://magppie-crm.vercel.app", "http://127.0.0.1:4300")
foreach ($root in @("HKCU:\Software\Policies\Google\Chrome", "HKCU:\Software\Policies\Microsoft\Edge")) {
  try {
    $key = "$root\LocalNetworkAccessAllowedForUrls"
    New-Item -Force -Path $key -ErrorAction Stop | Out-Null
    for ($i = 0; $i -lt $sites.Count; $i++) { Set-ItemProperty -Path $key -Name ([string]($i + 1)) -Value $sites[$i] -ErrorAction Stop }
  } catch { Write-Host "Note: this Windows user may not change browser settings. That is fine: the first time, the browser asks to allow the CRM to reach this PC. Click Allow." }
}
# Keep WhatsApp drawing even when other windows cover it, so the mirror stays live. Applies to this user only;
# WhatsApp must be closed and opened again once for it to take effect.
[Environment]::SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-features=CalculateNativeWinOcclusion", "User")
Write-Host "Close WhatsApp and open it again once, so the mirror stays live."
Write-Host "Done. The Magppie WhatsApp helper is running. Close and reopen Chrome or Edge once."
