# Magppie WhatsApp helper (Windows). Runs quietly in the background on this PC, on 127.0.0.1 port 47321 only.
# It lets the CRM page:
#   /ping                  check the helper is running
#   /frame                 get a picture of the WhatsApp window (the mirror; no "share your screen" question)
#   /open?phone=91...      open that chat in the WhatsApp app
#   /send?phone=..&text=.. put the message in that chat, press Enter, and bring the browser back
#                          (&files=id,id adds held photos, videos or PDFs, sent together with the text as caption)
#   /stage?name=..         (POST) hold a file for a moment; answers with its id
#   /health                the watchdog: is WhatsApp open, did it update, is the mirror frozen, what failed
#   /ackversion            mark a WhatsApp update as checked
# Speed: the message is pasted (not typed) and the waits are short when WhatsApp is already open.
# Only the Magppie CRM pages may use it (checked on every request). Nothing leaves this PC.
$Port = 47321
$Allowed = @("https://magppie-crm-helper.vercel.app", "https://magppie-crm.vercel.app", "http://127.0.0.1:4300", "http://localhost:4300")
$Log = Join-Path $env:LOCALAPPDATA "MagppieWA\log.txt"
function Note($t) { try { Add-Content -Path $Log -Value ((Get-Date -Format "dd MMM HH:mm:ss") + "  " + $t) } catch {} }

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class MWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void Front(IntPtr h) { keybd_event(0x12, 0, 0, UIntPtr.Zero); SetForegroundWindow(h); keybd_event(0x12, 0, 2, UIntPtr.Zero); }
}
"@
[MWin]::SetProcessDPIAware() | Out-Null

# Finding WhatsApp: only programs named WhatsApp are looked at (asking every program for its window was very slow),
# and the window is remembered for as long as it is still there and showing.
$script:WaHandle = [IntPtr]::Zero
function WhatsAppWindow {
  if ($script:WaHandle -ne [IntPtr]::Zero -and [MWin]::IsWindow($script:WaHandle) -and [MWin]::IsWindowVisible($script:WaHandle)) { return $script:WaHandle }
  # Found by its program name only (WhatsApp / WhatsApp.Root), never by a window title: a browser tab called "WhatsApp" must never be taken for it.
  $p = Get-Process -Name 'WhatsApp*' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) { $script:WaHandle = $p.MainWindowHandle } else { $script:WaHandle = [IntPtr]::Zero }
  return $script:WaHandle
}
# ---- Watchdog ----
$script:Sent = 0; $script:Failed = 0; $script:Suspect = 0; $script:Problems = New-Object System.Collections.ArrayList
$script:FrameHash = ""; $script:FrameSince = Get-Date
$VersionFile = Join-Path $env:LOCALAPPDATA "MagppieWA\whatsapp-version.txt"
function Problem($t) { Note ("PROBLEM " + $t); [void]$script:Problems.Insert(0, ((Get-Date -Format "dd MMM HH:mm") + "  " + $t)); while ($script:Problems.Count -gt 20) { $script:Problems.RemoveAt(20) } }
function WhatsAppVersion {
  $p = Get-Process -Name 'WhatsApp*' -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1
  if ($p) { try { $v = (Get-Item $p.Path).VersionInfo.FileVersion; if ($v) { return [string]$v } } catch { Note ("version: " + $_.Exception.Message) } }
  return ""
}
function Hash($bytes) { if (-not $bytes) { return "" }; $sha = [System.Security.Cryptography.SHA1]::Create(); return [BitConverter]::ToString($sha.ComputeHash($bytes)) }
function Health {
  $v = WhatsAppVersion
  $known = if (Test-Path $VersionFile) { (Get-Content $VersionFile -Raw).Trim() } else { "" }
  if ($v -and -not $known) { Set-Content -Path $VersionFile -Value $v; $known = $v }
  $win = (WhatsAppWindow) -ne [IntPtr]::Zero
  $frozen = [int]((Get-Date) - $script:FrameSince).TotalSeconds
  return @{ helper = $true; whatsappOpen = $win; version = $v; knownVersion = $known; updated = [bool]($v -and $known -and $v -ne $known);
            frozenSeconds = $frozen; sent = $script:Sent; failed = $script:Failed; suspect = $script:Suspect; problems = @($script:Problems) } | ConvertTo-Json -Compress
}

function Digits($s) { $d = ($s -replace '[^0-9]', ''); if ($d.Length -eq 10) { $d = "91" + $d }; return $d }
function Query($q, $name) {
  foreach ($pair in ($q -split '&')) { $kv = $pair -split '=', 2; if ($kv[0] -eq $name -and $kv.Count -eq 2) { return [Uri]::UnescapeDataString(($kv[1] -replace '\+', ' ')) } }
  return ""
}
function Frame {
  $h = WhatsAppWindow
  if ($h -eq [IntPtr]::Zero -or [MWin]::IsIconic($h)) { return $null }
  $r = New-Object MWin+RECT
  [MWin]::GetWindowRect($h, [ref]$r) | Out-Null
  $w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
  if ($w -lt 50 -or $ht -lt 50) { return $null }
  $bmp = New-Object System.Drawing.Bitmap $w, $ht
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc(); [MWin]::PrintWindow($h, $hdc, 2) | Out-Null; $g.ReleaseHdc($hdc); $g.Dispose()
  $scale = [Math]::Min(1.0, 900.0 / $w)
  $out = New-Object System.Drawing.Bitmap ([int]($w * $scale)), ([int]($ht * $scale))
  $g2 = [System.Drawing.Graphics]::FromImage($out); $g2.DrawImage($bmp, 0, 0, $out.Width, $out.Height); $g2.Dispose(); $bmp.Dispose()
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]55)
  $ms = New-Object System.IO.MemoryStream
  $out.Save($ms, $codec, $ep); $out.Dispose()
  $bytes = $ms.ToArray(); $hsh = Hash $bytes
  if ($hsh -ne $script:FrameHash) { $script:FrameHash = $hsh; $script:FrameSince = Get-Date }
  # The comma hands the picture back in one piece (without it PowerShell splits it into thousands of parts: slow).
  return ,$bytes
}
# Bring WhatsApp to the front on the right chat. Returns the WhatsApp window, or zero.
# The chat is always pointed at the number, so a chat changed by hand never gets the message by mistake.
# It waits until WhatsApp is really in front before anything is pasted (pasting too early is what loses messages).
$script:LastPhone = ""
function ToChat($phone) {
  $clock = [Diagnostics.Stopwatch]::StartNew()
  $wa = WhatsAppWindow
  $running = $wa -ne [IntPtr]::Zero
  if ($running -and [MWin]::IsIconic($wa)) { [MWin]::ShowWindow($wa, 9) | Out-Null }
  $same = $script:LastPhone -eq $phone
  # Opened through Windows directly: much quicker than PowerShell's Start-Process.
  $open = New-Object System.Diagnostics.ProcessStartInfo ("whatsapp://send?phone=" + $phone); $open.UseShellExecute = $true
  [void][System.Diagnostics.Process]::Start($open)
  for ($i = 0; $i -lt 40 -and $wa -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 150; $wa = WhatsAppWindow }
  if ($wa -eq [IntPtr]::Zero) { Note ("step: WhatsApp window not found after " + $clock.ElapsedMilliseconds + " ms"); return $wa }
  for ($i = 0; $i -lt 40 -and [MWin]::GetForegroundWindow() -ne $wa; $i++) { [MWin]::Front($wa); Start-Sleep -Milliseconds 25 }
  $front = [MWin]::GetForegroundWindow() -eq $wa
  # Let the chat open: longer the first time WhatsApp starts, or when switching to another client.
  # Safety floor: for a different client the chat must have switched before pasting, or the message would land in the previous chat.
  if (-not $running) { Start-Sleep -Milliseconds 2500 } elseif ($same) { Start-Sleep -Milliseconds 60 } else { Start-Sleep -Milliseconds 450 }
  $script:LastPhone = $phone
  Note ("step: chat ready in " + $clock.ElapsedMilliseconds + " ms, WhatsApp in front: " + $front + ", same chat: " + $same)
  return $wa
}
# The clipboard can be busy for a moment (another program using it); try again up to 10 times before giving up.
function Clip($set) {
  for ($i = 0; $i -lt 10; $i++) { try { & $set; return $true } catch { Start-Sleep -Milliseconds 100 } }
  Note "step: the clipboard stayed busy; could not paste"; return $false
}
function Paste { [System.Windows.Forms.SendKeys]::SendWait("^v") }
function Enter { [System.Windows.Forms.SendKeys]::SendWait("{ENTER}") }
$server = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), $Port
try { $server.Start() } catch { Note ("could not start: " + $_.Exception.Message); exit }
Note "helper started"
while ($true) {
  $client = $server.AcceptTcpClient(); $later = $null
  try {
    $stream = $client.GetStream(); $stream.ReadTimeout = 15000
    # Read the request in large pieces up to the blank line that ends the head; anything after it is the start of the body.
    $buf = New-Object byte[] 65536; $have = 0; $headEnd = -1
    while ($headEnd -lt 0 -and $have -lt $buf.Length) {
      $r = $stream.Read($buf, $have, $buf.Length - $have); if ($r -le 0) { break }; $have += $r
      $headEnd = [System.Text.Encoding]::ASCII.GetString($buf, 0, $have).IndexOf("`r`n`r`n")
    }
    if ($headEnd -lt 0) { $headEnd = $have }
    $headText = [System.Text.Encoding]::ASCII.GetString($buf, 0, $headEnd)
    $lines = $headText -split "`r`n"
    $first = $lines[0]; $origin = ""; $length = 0
    foreach ($l in $lines) { if ($l -match '^Origin:\s*(.+)$') { $origin = $Matches[1].Trim() }; if ($l -match '^Content-Length:\s*(\d+)') { $length = [int64]$Matches[1] } }
    $parts = ($first -split ' '); $method = $parts[0]; $target = $parts[1]
    $path = ($target -split '\?', 2)[0]; $q = if ($target -match '\?') { ($target -split '\?', 2)[1] } else { "" }
    $data = $null
    if ($length -gt 0 -and $length -le 104857600) {
      $data = New-Object byte[] $length
      # The first part of the body may already have arrived together with the head.
      $start = [Math]::Min($have, $headEnd + 4); $got = [int][Math]::Min($length, $have - $start)
      if ($got -gt 0) { [Array]::Copy($buf, $start, $data, 0, $got) }
      while ($got -lt $length) { $r = $stream.Read($data, $got, $length - $got); if ($r -le 0) { break }; $got += $r }
      if ($got -lt $length) { $data = $null }
    }
    $ok = $Allowed -contains $origin
    $type = "text/plain"; $body = [System.Text.Encoding]::UTF8.GetBytes("ok"); $code = "200 OK"
    if (-not $ok) { $code = "403 Forbidden"; $body = [System.Text.Encoding]::UTF8.GetBytes("not allowed") }
    elseif ($method -eq "OPTIONS") { $body = @() }
    elseif ($path -eq "/health") { $type = "application/json"; $body = [System.Text.Encoding]::UTF8.GetBytes((Health)) }
    elseif ($path -eq "/ackversion") { $v = WhatsAppVersion; if ($v) { Set-Content -Path $VersionFile -Value $v }; $script:Problems.Clear() }
    elseif ($path -eq "/frame") { $jpg = Frame; if ($jpg) { $type = "image/jpeg"; $body = $jpg } else { $code = "204 No Content"; $body = @() } }
    elseif ($path -eq "/open") {
      $d = Digits (Query $q "phone")
      if ($d.Length -ge 11 -and $d.Length -le 15) { $back = [MWin]::GetForegroundWindow(); ToChat $d | Out-Null; if ($back -ne [IntPtr]::Zero) { [MWin]::Front($back) } }
    }
    elseif ($path -eq "/stage") {
      $name = (Query $q "name") -replace '[^A-Za-z0-9 ._()-]', '_'; if (-not $name) { $name = "file" }
      if ($method -ne "POST" -or -not $data) { $code = "400 Bad Request"; $body = [System.Text.Encoding]::UTF8.GetBytes("no file (largest 100 MB)") }
      else {
        $folder = Join-Path $env:TEMP "MagppieWA\outbox"; New-Item -ItemType Directory -Force -Path $folder | Out-Null
        $id = [Guid]::NewGuid().ToString("N").Substring(0, 12)
        $sub = Join-Path $folder $id; New-Item -ItemType Directory -Force -Path $sub | Out-Null
        [System.IO.File]::WriteAllBytes((Join-Path $sub $name), $data)
        $body = [System.Text.Encoding]::UTF8.GetBytes($id)
      }
    }
    elseif ($path -eq "/send") {
      $d = Digits (Query $q "phone"); $t = Query $q "text"
      if ($t.Length -gt 2000) { $t = $t.Substring(0, 2000) }
      $files = @()
      foreach ($id in ((Query $q "files") -split ',')) {
        if ($id -match '^[a-f0-9]{12}$') { $sub = Join-Path $env:TEMP ("MagppieWA\outbox\" + $id); $f = Get-ChildItem -Path $sub -File -ErrorAction SilentlyContinue | Select-Object -First 1; if ($f) { $files += $f.FullName } }
      }
      if ($d.Length -lt 11 -or $d.Length -gt 15 -or (-not $t.Trim() -and $files.Count -eq 0)) { $code = "400 Bad Request"; $body = [System.Text.Encoding]::UTF8.GetBytes("bad number, or nothing to send") }
      elseif ((WhatsAppWindow) -eq [IntPtr]::Zero -and -not (Get-Process -Name WhatsApp* -ErrorAction SilentlyContinue)) { $code = "500 Error"; $body = [System.Text.Encoding]::UTF8.GetBytes("open the WhatsApp app first") }
      else {
        $job = { param($d, $t, $files)
          $back = [MWin]::GetForegroundWindow()
          # "Before" picture: the last mirror picture, so nothing extra is done while WhatsApp is in front.
          $before = $script:FrameHash
          $clock = [Diagnostics.Stopwatch]::StartNew()
          $wa = ToChat $d
          if ($wa -eq [IntPtr]::Zero) { $script:Failed++; Problem ("message to ..." + $d.Substring($d.Length - 4) + " NOT sent: the WhatsApp window was not found."); return }
          $saved = $null; try { if ([System.Windows.Forms.Clipboard]::ContainsText()) { $saved = [System.Windows.Forms.Clipboard]::GetText() } } catch { $saved = $null }
          if ($files.Count -gt 0) {
            $photos = @($files | Where-Object { $_ -match '\.(jpe?g|png|gif|bmp|webp)$' })
            $others = @($files | Where-Object { $_ -notmatch '\.(jpe?g|png|gif|bmp|webp)$' })
            $caption = $t.Trim()
            if ($photos.Count -gt 0) {
              # Photos: each pasted as a picture; WhatsApp gathers them in one preview; the text is their caption.
              foreach ($f in $photos) {
                try { $img = [System.Drawing.Image]::FromFile($f) } catch { Note ("step: could not read photo " + (Split-Path $f -Leaf)); continue }
                $okClip = Clip { [System.Windows.Forms.Clipboard]::SetImage($img) }; $img.Dispose(); if (-not $okClip) { continue }
                Paste; Start-Sleep -Milliseconds 500
              }
              Start-Sleep -Milliseconds 300
              if ($caption -and (Clip { [System.Windows.Forms.Clipboard]::SetText($caption) })) { Paste; Start-Sleep -Milliseconds 120; $caption = "" }
              Enter; Note ("step: " + $photos.Count + " photo(s) sent at " + $clock.ElapsedMilliseconds + " ms")
              if ($others.Count -gt 0) { Start-Sleep -Milliseconds 600 }
            }
            if ($others.Count -gt 0) {
              # PDFs and videos: pasted as files, all together; WhatsApp needs a moment to prepare them.
              $size = 0; foreach ($f in $others) { $size += (Get-Item $f).Length }
              $list = New-Object System.Collections.Specialized.StringCollection; foreach ($f in $others) { $list.Add($f) | Out-Null }
              if (-not (Clip { [System.Windows.Forms.Clipboard]::SetFileDropList($list) })) { throw "the clipboard was busy" }
              Paste
              Start-Sleep -Milliseconds ([int][Math]::Min(8000, 1000 + 200 * $others.Count + $size / 60000))
              if ($caption -and (Clip { [System.Windows.Forms.Clipboard]::SetText($caption) })) { Paste; Start-Sleep -Milliseconds 120; $caption = "" }
              Enter; Start-Sleep -Milliseconds 500; Enter
              Note ("step: " + $others.Count + " file(s) sent at " + $clock.ElapsedMilliseconds + " ms")
            }
          } else {
            if (-not (Clip { [System.Windows.Forms.Clipboard]::SetText($t) })) { throw "the clipboard was busy" }
            Paste; Start-Sleep -Milliseconds 40; Enter
          }
          # The browser comes back straight away; everything below happens out of sight.
          if ($back -ne [IntPtr]::Zero -and $back -ne $wa) { [MWin]::Front($back) }
          Note ("sent " + $(if ($files.Count) { $files.Count.ToString() + " file(s)" } else { "text" }) + " to " + $d.Substring(0, 4) + "... browser back after " + $clock.ElapsedMilliseconds + " ms")
          try { if ($saved) { [System.Windows.Forms.Clipboard]::SetText($saved) } } catch { Note "step: could not put back the old clipboard text" }
          Start-Sleep -Milliseconds 700; $after = Hash (Frame)
          if ($before -and $after -and $before -eq $after) { $script:Suspect++; Problem ("message to ..." + $d.Substring($d.Length - 4) + " may not have gone: WhatsApp did not change after sending. Please check that chat.") }
          else { $script:Sent++ }
          if ($files.Count -gt 0) { Start-Sleep -Milliseconds 1500; foreach ($f in $files) { Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Split-Path $f) } }
        }
        # The list of files is handed over as ONE item (wrapping it again made the job see a list inside a list).
        $later = @($job, $d, $t, $files)
      }
    }
    $head = "HTTP/1.1 " + $code + "`r`nContent-Type: " + $type + "`r`nContent-Length: " + $body.Length + "`r`nCache-Control: no-store`r`nConnection: close`r`n"
    if ($ok) { $head += "Access-Control-Allow-Origin: " + $origin + "`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: *`r`nAccess-Control-Allow-Private-Network: true`r`n" }
    $head += "`r`n"
    $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($hb, 0, $hb.Length); if ($body.Length) { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
  } catch { Note ("connection: " + $_.Exception.Message) }
  finally { $client.Close() }
  if ($later) { try { & $later[0] $later[1] $later[2] $later[3] } catch { $script:Failed++; Problem ("send error: " + $_.Exception.Message) } }
}
