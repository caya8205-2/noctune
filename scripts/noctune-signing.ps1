# Load .env variables from root directory if present
$envFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $key, $value = $line.Split("=", 2)
            $key = $key.Trim()
            $value = $value.Trim().Trim('"').Trim("'")
            if (-not [string]::IsNullOrEmpty($key)) {
                [Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }
}

$token = $env:SIGN_TOKEN
$organizationId = $env:ORGANIZATION_ID
$inputPath = $env:INPUT_PATH
$outputPath = $env:OUTPUT_PATH

if ([string]::IsNullOrWhiteSpace($token) -or [string]::IsNullOrWhiteSpace($organizationId) -or [string]::IsNullOrWhiteSpace($inputPath) -or [string]::IsNullOrWhiteSpace($outputPath)) {
    Write-Error "Missing required environment variables. Please check your .env file for SIGN_TOKEN, ORGANIZATION_ID, INPUT_PATH, and OUTPUT_PATH."
    exit 1
}

Submit-SigningRequest `
    -ApiToken $token `
    -OrganizationId $organizationId `
    -ProjectSlug "Noctune" `
    -SigningPolicySlug "Caya8205" `
    -InputArtifactPath $inputPath `
    -WaitForCompletion `
    -OutputArtifactPath $outputPath `
    -Force