param([string]$Spec, [string]$OcrDir, [string]$ImgSrcDir, [string]$OutDir, [string]$DebugDir)
Add-Type -AssemblyName System.Drawing
$specObj = Get-Content -Raw -Encoding utf8 $Spec | ConvertFrom-Json
$fullPath = Join-Path (Split-Path $Spec) 'full.json'; $fullObj = $null
if (Test-Path $fullPath) { $fullObj = Get-Content -Raw -Encoding utf8 $fullPath | ConvertFrom-Json }
$srcMap = @{ 'aed.png'='aed.png'; 'containment-bag.png'='containment bag.png'; 'elt1.png'='elt1.png'; 'elt2.png'='elt2.png'; 'emk.png'='emk.png'; 'fak.png'='fak.png';
  'fire-glove.png'='fire glove.png'; 'flashlight.png'='flash light.png'; 'h2o.png'='h2o.png'; 'halon.png'='halon.png'; 'raft1.png'='life raft1.png'; 'raft2.png'='life raft2.png';
  'raft3.png'='life raft3.png'; 'raft4.png'='life raft4.png'; 'megaphone.png'='megaphone.png'; 'pbe.png'='pbe.png'; 'po2.png'='PO2.png'; 'upk.png'='upk.png' }
New-Item -ItemType Directory -Force "$OutDir\img", $DebugDir | Out-Null
function W([char]$c) { if ($c -match '\s') { return 0.35 } elseif ([int]$c -ge 0xAC00 -and [int]$c -le 0xD7A3) { return 1.0 } elseif ($c -match '[A-Za-z0-9]') { return 0.58 } else { return 0.4 } }
$warn = @()
$groupsOut = @()
foreach ($g in $specObj.groups) {
  $imgsOut = @()
  foreach ($im in $g.images) {
    $ocr = Get-Content -Raw -Encoding utf8 (Join-Path $OcrDir ($im.ocr + '.json')) | ConvertFrom-Json
    $orig = Join-Path $ImgSrcDir $srcMap[$im.src]
    Copy-Item $orig "$OutDir\img\$($im.src)" -Force
    $bmp = [System.Drawing.Bitmap]::FromFile($orig); $canvas = New-Object System.Drawing.Bitmap $bmp; $bmp.Dispose()
    $gr = [System.Drawing.Graphics]::FromImage($canvas); $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::Red), 1.5
    $blanksOut = @()
    foreach ($b in $im.blanks) {
      if ($b -is [System.Management.Automation.PSCustomObject]) {
        $x=[double]$b.box[0]; $y=[double]$b.box[1]; $w=[double]$b.box[2]; $h=[double]$b.box[3]; $ans=$b.ans; $alts=@(); $full=$b.ans
      } else {
        $L=[int]$b[0]; $ws="$($b[1])"; $full=$b[2]; $ans=$b[3]; $alts=@($b | Select-Object -Skip 4)
        if ($ws -match '^(\d+)-(\d+)$') { $a=[int]$matches[1]; $z=[int]$matches[2] } else { $a=[int]$ws; $z=$a }
        $words = $ocr.lines[$L].words
        if ($z -ge $words.Count) { $warn += "$($im.src) L$L w$ws out of range ($($words.Count))"; continue }
        $sx=[double]$words[$a].x; $ex=[double]$words[$z].x + [double]$words[$z].w
        $y=999; $yb=0; for ($k=$a; $k -le $z; $k++) { $y=[math]::Min($y,[double]$words[$k].y); $yb=[math]::Max($yb,[double]$words[$k].y+[double]$words[$k].h) }
        $h=$yb-$y
        $ocrText = ($words[$a..$z] | ForEach-Object { $_.t }) -join ' '
        # locate answer inside full text, ignoring spaces
        $chars = $full.ToCharArray(); $ns=''; $idx=@()
        for ($k=0; $k -lt $chars.Length; $k++) { if ($chars[$k] -notmatch '\s') { $ns += $chars[$k]; $idx += $k } }
        $ansNs = ($ans -replace '\s','')
        $p = $ns.IndexOf($ansNs)
        if ($p -lt 0) { $warn += "$($im.src) L${L}: '$ans' not in '$full'"; $p=0; $ansNs=$ns }
        $s0=$idx[$p]; $e0=$idx[$p+$ansNs.Length-1]+1
        $tot=0; $pre=0; $mid=0
        for ($k=0; $k -lt $chars.Length; $k++) { $wt = W $chars[$k]; $tot+=$wt; if ($k -lt $s0) { $pre+=$wt } elseif ($k -lt $e0) { $mid+=$wt } }
        $span=$ex-$sx; $x=$sx + $span*($pre/$tot); $w=$span*($mid/$tot)
        Write-Host ("{0} L{1} w{2} [{3}] -> {4}" -f $im.src, $L, $ws, $ocrText, $ans)
      }
      $pad=1.5
      $x=[math]::Round($x-$pad,1); $y=[math]::Round($y-$pad,1); $w=[math]::Round($w+2*$pad,1); $h=[math]::Round($h+2*$pad,1)
      $gr.DrawRectangle($pen, [float]$x, [float]$y, [float]$w, [float]$h)
      $all = @($ans) + $alts + @($full -replace '[\s]','') | Select-Object -Unique
      $blanksOut += [ordered]@{ x=$x; y=$y; w=$w; h=$h; a=$ans; ok=@($all) }
    }
    # ---- level C extras: every bracketed word from full.json, skipping ones overlapping curated blanks
    $fl = $null; if ($fullObj) { $fl = $fullObj.PSObject.Properties[$im.ocr] }
    if ($fl) {
      $pen2 = New-Object System.Drawing.Pen ([System.Drawing.Color]::Blue), 1
      foreach ($lp in $fl.Value.PSObject.Properties) {
        $L = [int]$lp.Name; $parts = $lp.Value -split ' \| '
        $words = $ocr.lines[$L].words
        if ($parts.Count -ne $words.Count) { $warn += "FULL $($im.ocr) L${L}: $($parts.Count) parts vs $($words.Count) words"; continue }
        for ($wi=0; $wi -lt $parts.Count; $wi++) {
          $raw = $parts[$wi]; if ($raw -notmatch '\[') { continue }
          # plain text (brackets removed, alts removed) and segments
          $plain = ''; $segs = @(); $pos = 0
          foreach ($m in [regex]::Matches($raw, '\[([^\]]*)\]|[^\[]+')) {
            if ($m.Groups[1].Success) { $bits = $m.Groups[1].Value -split '='; $s=$plain.Length; $plain += $bits[0]; $segs += ,@($s, $plain.Length, $bits) }
            else { $plain += $m.Value }
          }
          $wd = $words[$wi]; $sx=[double]$wd.x; $span=[double]$wd.w
          $chars = $plain.ToCharArray(); $tot=0; foreach ($c in $chars) { $tot += (W $c) }
          foreach ($sg in $segs) {
            $pre=0; $mid=0
            for ($k=0; $k -lt $chars.Length; $k++) { $wt = W $chars[$k]; if ($k -lt $sg[0]) { $pre+=$wt } elseif ($k -lt $sg[1]) { $mid+=$wt } }
            $pad=1.5
            $x=[math]::Round($sx + $span*($pre/$tot) - $pad,1); $y=[math]::Round([double]$wd.y - $pad,1)
            $w=[math]::Round($span*($mid/$tot) + 2*$pad,1); $h=[math]::Round([double]$wd.h + 2*$pad,1)
            $hit = $false
            foreach ($cb in $blanksOut) { if ($cb.e) { continue }
              $ix = [math]::Min($x+$w, $cb.x+$cb.w) - [math]::Max($x, $cb.x); $iy = [math]::Min($y+$h, $cb.y+$cb.h) - [math]::Max($y, $cb.y)
              if ($ix -gt 0 -and $iy -gt 0 -and ($ix*$iy) -gt 0.3*[math]::Min($w*$h, $cb.w*$cb.h)) { $hit = $true; break } }
            if ($hit) { continue }
            $gr.DrawRectangle($pen2, [float]$x, [float]$y, [float]$w, [float]$h)
            $blanksOut += [ordered]@{ x=$x; y=$y; w=$w; h=$h; a=$sg[2][0]; ok=@($sg[2] | Select-Object -Unique); e=1 }
          }
        }
      }
    }
    $gr.Dispose(); $canvas.Save((Join-Path $DebugDir $im.src)); $canvas.Dispose()
    $imgsOut += [ordered]@{ src="img/$($im.src)"; w=$ocr.width; h=$ocr.height; blanks=$blanksOut }
  }
  $groupsOut += [ordered]@{ id=$g.id; title=$g.title; sub=$g.sub; icon=$g.icon; images=$imgsOut }
}
$json = ConvertTo-Json -InputObject $groupsOut -Depth 8 -Compress
[System.IO.File]::WriteAllText("$OutDir\data.js", "/* Auto-generated: blank positions and answers for equipment photos (x,y,w,h in image pixels) */`nwindow.JANGBI_DATA = $json;`n", (New-Object System.Text.UTF8Encoding $false))
Write-Host "---- WARNINGS"; $warn | ForEach-Object { Write-Host $_ }
