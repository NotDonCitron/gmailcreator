# Sets mock SMS env vars and runs the automation end-to-end using the free/manual provider.
$ErrorActionPreference = "Stop"

$env:SMS_PROVIDER = "mock"
$env:SMS_CODE_INPUT_MODE = "env"              # env | file | prompt
$env:SMS_MANUAL_PHONE = "+12025550123"       # placeholder test number for UI
$env:SMS_CODE = "123456"                     # code to be consumed by the mock provider
$env:SKIP_PHONE_VERIFICATION = "false"       # ensure phone step is not skipped

# Optional visibility/config
if (-not $env:BROWSER_HEADLESS) { $env:BROWSER_HEADLESS = "true" }

Write-Host "Running with:"
Write-Host "  SMS_PROVIDER=$($env:SMS_PROVIDER)"
Write-Host "  SMS_CODE_INPUT_MODE=$($env:SMS_CODE_INPUT_MODE)"
Write-Host "  SMS_MANUAL_PHONE=$($env:SMS_MANUAL_PHONE)"
Write-Host "  SKIP_PHONE_VERIFICATION=$($env:SKIP_PHONE_VERIFICATION)"
Write-Host "  BROWSER_HEADLESS=$($env:BROWSER_HEADLESS)"
Write-Host ""

npm start