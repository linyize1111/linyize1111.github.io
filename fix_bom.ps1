$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$content = [System.IO.File]::ReadAllText("literature.html", [System.Text.Encoding]::UTF8)
if ($content[0] -eq [char]0xFEFF) {
    $content = $content.Substring(1)
    Write-Host "BOM found and removed"
} else {
    Write-Host "No BOM found"
}
[System.IO.File]::WriteAllText("literature.html", $content, $utf8NoBom)
Write-Host "Done: literature.html saved as UTF-8 without BOM"
