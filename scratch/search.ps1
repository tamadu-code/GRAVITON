$pattern = $args[0]
$lines = Get-Content 'c:\Users\ELECTRO-TECH\OneDrive\Desktop\SMS\assets\js\ui.js'
for ($i=0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match $pattern) {
        Write-Output ("{0}: {1}" -f ($i+1), $lines[$i].TrimStart())
    }
}
