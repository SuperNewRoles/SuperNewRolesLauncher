param(
    [string]$WebhookUrl = $env:SNRLAUNCHER_DISCORD_RELEASE_WEBHOOK_URL,

    [Parameter(Mandatory = $true)]
    [string]$Message
)

$ErrorActionPreference = "Stop"

function Normalize-WebhookMessage {
    param(
        [string]$Value
    )

    if ($null -eq $Value) {
        return $Value
    }

    if ($Value.Length -gt 0 -and [int][char]$Value[0] -eq 0xFEFF) {
        return $Value.Substring(1)
    }

    return $Value
}

if ($null -ne $WebhookUrl) {
    $WebhookUrl = $WebhookUrl.Trim()
}

$Message = Normalize-WebhookMessage -Value $Message

if ([string]::IsNullOrWhiteSpace($WebhookUrl)) {
    throw "WebhookUrl is required. Set SNRLAUNCHER_DISCORD_RELEASE_WEBHOOK_URL or pass -WebhookUrl."
}

if ([string]::IsNullOrWhiteSpace($Message)) {
    throw "Message is required."
}

$payload = @{
    content = $Message
} | ConvertTo-Json -Depth 4 -Compress

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName "System.Net.Http"

$client = [System.Net.Http.HttpClient]::new()
$content = [System.Net.Http.StringContent]::new($payload, [System.Text.Encoding]::UTF8, "application/json")

try {
    $response = $client.PostAsync($WebhookUrl, $content).GetAwaiter().GetResult()
    $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()

    if (-not $response.IsSuccessStatusCode) {
        throw ("Discord webhook request failed ({0} {1}): {2}" -f [int]$response.StatusCode, $response.ReasonPhrase, $responseBody)
    }
}
finally {
    $content.Dispose()
    $client.Dispose()
}

Write-Output "Discord webhook announcement posted."
