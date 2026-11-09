param([string]$InDir, [string]$OutDir, [double]$Scale = 3)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
$lang = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | Where-Object { $_.LanguageTag -eq 'ko' } | Select-Object -First 1
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if (-not $engine) { throw "no ko OCR engine" }
New-Item -ItemType Directory -Force $OutDir | Out-Null
Get-ChildItem $InDir -Filter *.png | Where-Object { -not (Test-Path (Join-Path $OutDir ($_.BaseName + ".json"))) } | ForEach-Object {
  $src = [System.Drawing.Image]::FromFile($_.FullName)
  $w = $src.Width; $h = $src.Height
  $big = New-Object System.Drawing.Bitmap ([int]($w * $Scale)), ([int]($h * $Scale))
  $g = [System.Drawing.Graphics]::FromImage($big)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src, 0, 0, [int]($w * $Scale), [int]($h * $Scale)); $g.Dispose(); $src.Dispose()
  $tmp = Join-Path $OutDir ($_.BaseName + '.big.png')
  $big.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png); $big.Dispose()
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tmp)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
  $lines = @()
  foreach ($ln in $res.Lines) {
    $words = @()
    foreach ($wd in $ln.Words) {
      $r = $wd.BoundingRect
      $words += [ordered]@{ t = $wd.Text; x = [math]::Round($r.X / $Scale, 1); y = [math]::Round($r.Y / $Scale, 1); w = [math]::Round($r.Width / $Scale, 1); h = [math]::Round($r.Height / $Scale, 1) }
    }
    $lines += ,([ordered]@{ text = $ln.Text; words = $words })
  }
  $stream.Dispose(); Remove-Item $tmp
  $obj = [ordered]@{ file = $_.Name; width = $w; height = $h; lines = $lines }
  $obj | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 (Join-Path $OutDir ($_.BaseName + '.json'))
  Write-Host "$($_.Name): $($lines.Count) lines"
}
