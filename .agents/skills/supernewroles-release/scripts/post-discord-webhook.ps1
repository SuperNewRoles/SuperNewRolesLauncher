$ErrorActionPreference = "Stop"

param(
    [string]$WebhookUrl = $env:SNRLAUNCHER_DISCORD_RELEASE_WEBHOOK_URL,

    [Parameter(Mandatory = $true)]
    [string]$Message
)

if ([string]::IsNullOrWhiteSpace($WebhookUrl)) {
    throw "WebhookUrl is required. Set SNRLAUNCHER_DISCORD_RELEASE_WEBHOOK_URL or pass -WebhookUrl."
}

if ([string]::IsNullOrWhiteSpace($Message)) {
    throw "Message is required."
}

$payload = @{
    content = $Message
} | ConvertTo-Json -Depth 4 -Compress

Invoke-RestMethod -Method Post -Uri $WebhookUrl -Body $payload -ContentType "application/json" | Out-Null
Write-Output "Discord webhook announcement posted."
