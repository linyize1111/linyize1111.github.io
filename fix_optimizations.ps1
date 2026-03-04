$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$files = Get-ChildItem -Filter *.html

foreach ($file in $files) {
    if (Test-Path $file.FullName) {
        $txt = [System.IO.File]::ReadAllText($file.FullName, $utf8NoBom)
        
        $txt = $txt -replace '<img src="', '<img loading="lazy" src="'
        $txt = $txt -replace '<video id="bg-video" autoplay muted loop playsinline>', '<video id="bg-video" autoplay muted loop playsinline preload="none">'
        $txt = $txt -replace '<audio id="bg-music" loop preload="auto">', '<audio id="bg-music" loop preload="none">'

        [System.IO.File]::WriteAllText($file.FullName, $txt, $utf8NoBom)
        Write-Host "Re-applied optimizations to $($file.Name)"
    }
}
