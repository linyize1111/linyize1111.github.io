Add-Type -AssemblyName System.Drawing

$imagesPath = "images"
$maxSizeMB = 1

$files = Get-ChildItem -Path $imagesPath -Filter "*.jpg" | Where-Object { ($_.Length / 1MB) -gt $maxSizeMB }

foreach ($file in $files) {
    Write-Host "Compressing $($file.Name) ($([math]::Round($file.Length / 1MB, 2)) MB)..."
    
    $img = [System.Drawing.Image]::FromFile($file.FullName)
    
    # Calculate new size (max width/height 1920)
    $maxDim = 1280
    $ratio = 1.0
    if ($img.Width -gt $maxDim -or $img.Height -gt $maxDim) {
        $ratio = [math]::Min($maxDim / $img.Width, $maxDim / $img.Height)
    }
    
    $newW = [int]($img.Width * $ratio)
    $newH = [int]($img.Height * $ratio)
    
    $newImg = New-Object System.Drawing.Bitmap($newW, $newH)
    $g = [System.Drawing.Graphics]::FromImage($newImg)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $newW, $newH)
    $g.Dispose()
    $img.Dispose()
    
    # Save with JPEG quality 75
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]75)
    
    $tempPath = $file.FullName + ".tmp.jpg"
    $newImg.Save($tempPath, $codec, $encoderParams)
    $newImg.Dispose()
    
    Remove-Item $file.FullName -Force
    Rename-Item $tempPath $file.Name
    
    $newSize = (Get-Item $file.FullName).Length
    Write-Host "Done $($file.Name): new size $([math]::Round($newSize / 1MB, 2)) MB`n"
}
Write-Host "Compression complete."
