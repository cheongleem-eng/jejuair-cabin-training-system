param([string]$Lines, [string]$OcrDir, [string]$ImgSrcDir, [string]$OutDir, [string]$DebugDir)
# Builds data.js from lines.json (text copied from the manual PDF with [key] / {extra} marks)
# and the OCR word boxes of the cropped PDF renders. Blank positions come from the OCR words.
Add-Type -AssemblyName System.Drawing
$specObj = Get-Content -Raw -Encoding utf8 $Lines | ConvertFrom-Json
New-Item -ItemType Directory -Force "$OutDir\img", $DebugDir | Out-Null

function W([char]$c) { if ($c -match '\s') { return 0.35 } elseif ([int]$c -ge 0xAC00 -and [int]$c -le 0xD7A3) { return 1.0 } elseif ($c -match '[A-Za-z0-9]') { return 0.58 } else { return 0.4 } }
function Norm([string]$s) { return ($s -replace '[^0-9A-Za-z가-힣]', '').ToLower() }
function Dice([string]$a, [string]$b) {
  if (-not $a -or -not $b) { return 0 }
  $ha = @{}; foreach ($c in $a.ToCharArray()) { $ha[$c] = 1 + [int]$ha[$c] }
  $common = 0; foreach ($c in $b.ToCharArray()) { if ($ha[$c] -gt 0) { $common++; $ha[$c]-- } }
  return 2.0 * $common / ($a.Length + $b.Length)
}
# position of chars [s0,e0) inside text spanning [sx, sx+span)
function Span([string]$text, [int]$s0, [int]$e0, [double]$sx, [double]$span) {
  $chars = $text.ToCharArray(); $tot = 0; $pre = 0; $mid = 0
  for ($k = 0; $k -lt $chars.Length; $k++) { $wt = W $chars[$k]; $tot += $wt; if ($k -lt $s0) { $pre += $wt } elseif ($k -lt $e0) { $mid += $wt } }
  if ($tot -le 0) { return @($sx, $span) }
  return @(($sx + $span * ($pre / $tot)), ($span * ($mid / $tot)))
}

$warn = @(); $report = @(); $groupsOut = @()
foreach ($g in $specObj.groups) {
  $imgsOut = @()
  foreach ($im in $g.images) {
    $base = [IO.Path]::GetFileNameWithoutExtension($im.src)
    $ocr = Get-Content -Raw -Encoding utf8 (Join-Path $OcrDir ($base + '.json')) | ConvertFrom-Json
    Copy-Item (Join-Path $ImgSrcDir $im.src) "$OutDir\img\$($im.src)" -Force
    # OCR lines sorted top to bottom
    $ol = @(); foreach ($ln in $ocr.lines) { if (-not $ln.words -or $ln.words.Count -eq 0) { continue }
      $ws = @($ln.words); $y = ($ws | ForEach-Object { [double]$_.y } | Measure-Object -Minimum).Minimum
      $ol += [pscustomobject]@{ words = $ws; y = $y; norm = (Norm (($ws | ForEach-Object { $_.t }) -join '')); text = (($ws | ForEach-Object { $_.t }) -join ' ') } }
    $ol = @($ol | Sort-Object y)
    # merge OCR lines that the engine split mid-sentence: same baseline, small horizontal gap
    $merged = @()
    foreach ($ln in $ol) {
      $done = $false
      for ($q = $merged.Count - 1; $q -ge [math]::Max(0, $merged.Count - 4); $q--) {
        $prev = $merged[$q]; $pw = $prev.words[$prev.words.Count - 1]; $fw = $ln.words[0]
        $h = [double]$pw.h; $gap = [double]$fw.x - ([double]$pw.x + [double]$pw.w)
        $dy = [math]::Abs(([double]$pw.y + $h / 2) - ([double]$fw.y + [double]$fw.h / 2))
        if ($dy -lt 0.45 * $h -and $gap -gt -0.3 * $h -and $gap -lt 1.3 * $h) {
          $ws = @($prev.words) + @($ln.words)
          $merged[$q] = [pscustomobject]@{ words = $ws; y = $prev.y; norm = (Norm (($ws | ForEach-Object { $_.t }) -join '')); text = (($ws | ForEach-Object { $_.t }) -join ' ') }
          $done = $true; break
        }
      }
      if (-not $done) { $merged += $ln }
    }
    $ol = @($merged)
    $bmp = [System.Drawing.Bitmap]::FromFile("$OutDir\img\$($im.src)"); $canvas = New-Object System.Drawing.Bitmap $bmp; $bmp.Dispose()
    $gr = [System.Drawing.Graphics]::FromImage($canvas)
    $penK = New-Object System.Drawing.Pen ([System.Drawing.Color]::Red), 2; $penE = New-Object System.Drawing.Pen ([System.Drawing.Color]::Blue), 1.5
    $blanksOut = @(); $last = -1; $usedLines = @{}
    foreach ($raw in $im.lines) {
      # parse marks -> plain text + segments
      $plain = ''; $segs = @()
      foreach ($m in [regex]::Matches($raw, '\[([^\]]*)\]|\{([^}]*)\}|[^\[\{]+')) {
        if ($m.Groups[1].Success -or $m.Groups[2].Success) {
          $core = $m.Groups[1].Success; if ($core) { $val = $m.Groups[1].Value } else { $val = $m.Groups[2].Value }; $alts = @($val -split '=')
          $s = $plain.Length; $plain += $alts[0]; $segs += ,@{ s = $s; e = $plain.Length; alts = $alts; core = $core }
        } else { $plain += $m.Value }
      }
      if ($segs.Count -eq 0) { $anchorOnly = $true } else { $anchorOnly = $false }
      $nspec = Norm $plain
      $oneWord = (@($plain -split ' ' | Where-Object { $_ -ne '' })).Count -eq 1
      if ($oneWord) {
        # quantity cell: exact text match on an unused line, nearest to the current reading position; does not move the position
        $cands = @(); for ($i = 0; $i -lt $ol.Count; $i++) { if ($ol[$i].norm -eq $nspec -and -not $usedLines.ContainsKey($i)) { $cands += $i } }
        if ($cands.Count -eq 0) { $warn += "$($im.src): no unused OCR line for '$plain'"; continue }
        $best = $cands | Sort-Object { [math]::Abs($_ - ($last + 1)) } | Select-Object -First 1
        $usedLines[$best] = 1
      }
      # find the OCR line: best Dice score, mild penalty for jumping far from the previous match
      if (-not $oneWord) { $best = -1 }; $bestScore = 0; $lo = [math]::Max(0, $last - 6); $hi = [math]::Min($ol.Count - 1, $last + 16)
      if ($oneWord) { $lo = 1; $hi = 0 }
      for ($i = $lo; $i -le $hi; $i++) { $d = Dice $nspec $ol[$i].norm; $dist = $i - ($last + 1); if ($dist -ge 0) { $score = $d - 0.012 * $dist } else { $score = $d - 0.06 * (-$dist) }; if ($score -gt $bestScore) { $bestScore = $score; $best = $i } }
      if (-not $oneWord -and ($best -lt 0 -or (Dice $nspec $ol[$best].norm) -lt 0.6)) {
        # not in the window (e.g. many picture labels in between): search the whole rest of the page
        $best = -1; $bestScore = 0
        for ($i = 0; $i -lt $ol.Count; $i++) { $d = Dice $nspec $ol[$i].norm; if ($i -gt $last) { $d += 0.03 }; if ($d -gt $bestScore) { $bestScore = $d; $best = $i } }
      }
      if ($best -lt 0 -or (Dice $nspec $ol[$best].norm) -lt 0.55) {
        if (-not $anchorOnly) { $warn += "$($im.src): no OCR line for '$plain'" }
        continue
      }
      $line = $ol[$best]; if (-not $oneWord) { $last = $best }
      $report += ("{0,-14} {1:0.00} | {2} | {3}" -f $base, (Dice $nspec $line.norm), $plain, $line.text)
      if ($anchorOnly) { continue }
      # word alignment: true words -> OCR words (greedy, in order)
      $tw = @($plain -split ' ' | Where-Object { $_ -ne '' })
      # words of this line plus words of other OCR lines on the same baseline (engine sometimes splits a sentence), junk-sized words dropped
      $lh = ($line.words | ForEach-Object { [double]$_.h } | Measure-Object -Maximum).Maximum
      $lc = (($line.words | ForEach-Object { [double]$_.y + [double]$_.h / 2 } | Measure-Object -Average).Average)
      $ow = @($line.words)
      foreach ($other in $ol) { if ($other -eq $line -or $tw.Count -le $line.words.Count) { continue }
        foreach ($wd in $other.words) { $wc = [double]$wd.y + [double]$wd.h / 2; if ([math]::Abs($wc - $lc) -lt 0.5 * $lh -and [double]$wd.h -ge 0.6 * $lh) { $ow += $wd } } }
      $ow = @($ow | Where-Object { [double]$_.h -ge 0.6 * $lh } | Sort-Object { [double]$_.x })
      # a one-word spec line (quantity cell) that the engine split into several words: use the whole line box
      if ($tw.Count -eq 1 -and $line.words.Count -gt 1 -and $line.norm -eq (Norm $tw[0])) {
        $ws0 = @($line.words | Sort-Object { [double]$_.x }); $lx = [double]$ws0[0].x; $lw0 = $ws0[$ws0.Count - 1]
        $ow = @([pscustomobject]@{ t = $tw[0]; x = $lx; y = ($ws0 | ForEach-Object { [double]$_.y } | Measure-Object -Minimum).Minimum; w = ([double]$lw0.x + [double]$lw0.w - $lx); h = ($ws0 | ForEach-Object { [double]$_.h } | Measure-Object -Maximum).Maximum })
      }
      # map[i] = OCR word index; sub[i] = @(charStart, charEnd) inside that OCR word when the engine merged several words
      $map = @{}; $sub = @{}; $j = 0; $used = 0
      for ($i = 0; $i -lt $tw.Count; $i++) {
        $nt = Norm $tw[$i]; $bj = -1; $bd = 0; $bsub = $null
        for ($k = $j; $k -lt [math]::Min($ow.Count, $j + 3); $k++) {
          $no = Norm $ow[$k].t; $d = Dice $nt $no
          if ($nt.Length -ge 1 -and $no.Length -gt $nt.Length -and $no.IndexOf($nt, $(if ($k -eq $j) { $used } else { 0 })) -ge 0) { $d = 0.95 }
          if ($d -gt $bd) { $bd = $d; $bj = $k }
        }
        if ($bd -lt 0.5) { # not nearby: accept an exact match anywhere to the right (e.g. a quantity cell after the row text)
          for ($k = $j; $k -lt $ow.Count; $k++) { if ((Norm $ow[$k].t) -eq $nt -and $nt.Length -ge 1) { $bj = $k; $bd = 1; break } } }
        if ($bj -ge 0 -and $bd -ge 0.5) {
          $map[$i] = $bj; $no = Norm $ow[$bj].t
          if ($no.Length -gt $nt.Length + 1 -and $nt.Length -ge 1) {
            # merged OCR word: locate this true word inside it (on the raw text, skipping already used chars)
            $raw = $ow[$bj].t; $start = $(if ($bj -eq $j) { $used } else { 0 }); $p = -1
            $cand = $tw[$i] -replace '[^0-9A-Za-z가-힣]', ''
            if ($cand) { $p = $raw.IndexOf($cand, [math]::Min($start, $raw.Length), [StringComparison]::OrdinalIgnoreCase) }
            if ($p -ge 0) { $sub[$i] = @($p, $p + $cand.Length); $used = $p + $cand.Length; $j = $bj }
            else { $j = $bj + 1; $used = 0 }
          } else { $j = $bj + 1; $used = 0 }
        }
      }
      # char offset of each true word inside plain
      $wStart = @(); $pos = 0; foreach ($w in $tw) { $idx = $plain.IndexOf($w, $pos); $wStart += $idx; $pos = $idx + $w.Length }
      $lineY = ($ow | ForEach-Object { [double]$_.y } | Measure-Object -Minimum).Minimum
      $lineB = ($ow | ForEach-Object { [double]$_.y + [double]$_.h } | Measure-Object -Maximum).Maximum
      foreach ($sg in $segs) {
        # which true word holds this segment
        $wi = -1; for ($i = 0; $i -lt $tw.Count; $i++) { if ($sg.s -ge $wStart[$i] -and $sg.s -lt $wStart[$i] + $tw[$i].Length) { $wi = $i; break } }
        if ($wi -lt 0) { $warn += "$($im.src): segment '$($sg.alts[0])' not inside a word"; continue }
        $segEnd = [math]::Min($sg.e, $wStart[$wi] + $tw[$wi].Length)
        if ($map.ContainsKey($wi) -and $sub.ContainsKey($wi)) {
          # true word sits inside a merged OCR word: position the segment inside the OCR word text
          $o = $ow[$map[$wi]]; $raw = $o.t; $a = $sub[$wi][0]
          $segText = $plain.Substring($sg.s, $segEnd - $sg.s) -replace '[^0-9A-Za-z가-힣]', ''
          $p = $raw.IndexOf($segText, $a, [StringComparison]::OrdinalIgnoreCase); if ($p -lt 0) { $p = $a }
          $r = Span $raw $p ($p + $segText.Length) ([double]$o.x) ([double]$o.w)
          $x = $r[0]; $w = $r[1]; $y = [double]$o.y; $h = [double]$o.h
        } elseif ($map.ContainsKey($wi)) {
          $o = $ow[$map[$wi]]
          $r = Span $tw[$wi] ($sg.s - $wStart[$wi]) ($segEnd - $wStart[$wi]) ([double]$o.x) ([double]$o.w)
          $x = $r[0]; $w = $r[1]; $y = [double]$o.y; $h = [double]$o.h
        } else {
          # interpolate between the nearest matched words
          $pi = $wi - 1; while ($pi -ge 0 -and -not $map.ContainsKey($pi)) { $pi-- }
          $ni = $wi + 1; while ($ni -lt $tw.Count -and -not $map.ContainsKey($ni)) { $ni++ }
          if ($pi -ge 0) { $sx = [double]$ow[$map[$pi]].x + [double]$ow[$map[$pi]].w; $cs = $wStart[$pi] + $tw[$pi].Length } else { $sx = [double]$ow[0].x; $cs = 0 }
          if ($ni -lt $tw.Count) { $ex = [double]$ow[$map[$ni]].x; $ce = $wStart[$ni] } else { $lw = $ow[$ow.Count - 1]; $ex = [double]$lw.x + [double]$lw.w; $ce = $plain.Length }
          $subText = $plain.Substring($cs, $ce - $cs)
          $r = Span $subText ($sg.s - $cs) ($segEnd - $cs) $sx ($ex - $sx)
          $x = $r[0]; $w = $r[1]; $y = $lineY; $h = $lineB - $lineY
          # sanity check: an interpolated box far wider than the word itself means the row text was not found; skip it
          $expect = 0; foreach ($c in $plain.Substring($sg.s, $segEnd - $sg.s).ToCharArray()) { $expect += (W $c) }; $expect *= $h * 0.95
          if ($w -gt 2.2 * $expect + 6) { $warn += "$($im.src): '$($sg.alts[0])' SKIPPED (interpolated box too wide) in '$plain'"; continue }
          $warn += "$($im.src): '$($sg.alts[0])' placed by interpolation in '$plain'"
        }
        $pad = 2.5
        $x = [math]::Round($x - $pad, 1); $y = [math]::Round($y - $pad, 1); $w = [math]::Round($w + 2 * $pad, 1); $h = [math]::Round($h + 2 * $pad, 1)
        $pen = if ($sg.core) { $penK } else { $penE }
        $gr.DrawRectangle($pen, [float]$x, [float]$y, [float]$w, [float]$h)
        $b = [ordered]@{ x = $x; y = $y; w = $w; h = $h; a = $sg.alts[0]; ok = @($sg.alts | Select-Object -Unique) }
        if (-not $sg.core) { $b.e = 1 }
        $blanksOut += $b
      }
    }
    $gr.Dispose(); $canvas.Save((Join-Path $DebugDir $im.src)); $canvas.Dispose()
    $imgsOut += [ordered]@{ src = "img/$($im.src)"; w = $ocr.width; h = $ocr.height; blanks = $blanksOut }
  }
  $groupsOut += [ordered]@{ id = $g.id; title = $g.title; sub = $g.sub; icon = $g.icon; images = $imgsOut }
}
$json = ConvertTo-Json -InputObject $groupsOut -Depth 8 -Compress
[System.IO.File]::WriteAllText("$OutDir\data.js", "/* Auto-generated by tools/build2.ps1 from tools/lines.json (text from COM REV.69 PDF). x,y,w,h in image pixels */`nwindow.JANGBI_DATA = $json;`n", (New-Object System.Text.UTF8Encoding $false))
$report | Out-File -Encoding utf8 (Join-Path $DebugDir 'align.txt')
$warn | Out-File -Encoding utf8 (Join-Path $DebugDir 'warn.txt')
Write-Host "blanks: $(($groupsOut | ForEach-Object { $_.images } | ForEach-Object { $_.blanks.Count } | Measure-Object -Sum).Sum)  warnings: $($warn.Count)"
