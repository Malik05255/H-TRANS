Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$dir = Join-Path $PSScriptRoot "."
$sidebarPath = Join-Path $dir "installer-sidebar.bmp"
$headerPath = Join-Path $dir "installer-header.bmp"

function New-HTransBitmap {
  param(
    [int]$Width,
    [int]$Height,
    [string]$Path,
    [bool]$Sidebar
  )

  $bmp = New-Object System.Drawing.Bitmap $Width, $Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $navy = [System.Drawing.Color]::FromArgb(7, 19, 31)
  $navy2 = [System.Drawing.Color]::FromArgb(10, 37, 57)
  $blue = [System.Drawing.Color]::FromArgb(21, 157, 255)
  $cyan = [System.Drawing.Color]::FromArgb(72, 183, 255)
  $white = [System.Drawing.Color]::FromArgb(239, 248, 255)
  $muted = [System.Drawing.Color]::FromArgb(135, 164, 184)

  $g.Clear($navy)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point 0,0),
    (New-Object System.Drawing.Point $Width,$Height),
    $navy2,
    $navy
  )
  $g.FillRectangle($brush, 0, 0, $Width, $Height)

  if ($Sidebar) {
    $pen = New-Object System.Drawing.Pen $blue, 3
    $g.DrawRectangle($pen, 25, 36, 74, 74)
    $fontH = New-Object System.Drawing.Font "Segoe UI", 42, ([System.Drawing.FontStyle]::Bold)
    $fontName = New-Object System.Drawing.Font "Segoe UI", 17, ([System.Drawing.FontStyle]::Bold)
    $fontSub = New-Object System.Drawing.Font "Segoe UI", 8
    $g.DrawString("H", $fontH, (New-Object System.Drawing.SolidBrush $cyan), 38, 40)
    $g.DrawString("H TRANS", $fontName, (New-Object System.Drawing.SolidBrush $white), 24, 140)
    $g.DrawString("ANDROID CHAT", $fontSub, (New-Object System.Drawing.SolidBrush $muted), 25, 173)
    $g.DrawString("BACKUP & RESTORE", $fontSub, (New-Object System.Drawing.SolidBrush $muted), 25, 189)
    $g.DrawLine((New-Object System.Drawing.Pen $blue, 2), 25, 225, 138, 225)
  } else {
    $pen = New-Object System.Drawing.Pen $blue, 2
    $g.DrawRectangle($pen, 7, 8, 38, 38)
    $fontH = New-Object System.Drawing.Font "Segoe UI", 22, ([System.Drawing.FontStyle]::Bold)
    $fontName = New-Object System.Drawing.Font "Segoe UI", 13, ([System.Drawing.FontStyle]::Bold)
    $g.DrawString("H", $fontH, (New-Object System.Drawing.SolidBrush $cyan), 14, 9)
    $g.DrawString("H TRANS", $fontName, (New-Object System.Drawing.SolidBrush $white), 54, 16)
  }

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $g.Dispose()
  $bmp.Dispose()
}

New-HTransBitmap -Width 164 -Height 314 -Path $sidebarPath -Sidebar $true
New-HTransBitmap -Width 150 -Height 57 -Path $headerPath -Sidebar $false

Write-Host "Generated H TRANS installer branding assets."
