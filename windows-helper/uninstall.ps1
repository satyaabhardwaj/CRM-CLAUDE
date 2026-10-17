# Removes the Magppie WhatsApp helper completely.
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'MagppieWA\\helper.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "MagppieWA" -ErrorAction SilentlyContinue
foreach ($root in @("HKCU:\Software\Policies\Google\Chrome", "HKCU:\Software\Policies\Microsoft\Edge")) { Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$root\LocalNetworkAccessAllowedForUrls" }
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "HKCU:\Software\Classes\magppiewa"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $env:LOCALAPPDATA "MagppieWA")
[Environment]::SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", $null, "User")
Write-Host "Removed."
