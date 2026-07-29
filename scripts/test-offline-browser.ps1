$ErrorActionPreference = "Stop"

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:TEMP ("sys-offline-browser-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $profile | Out-Null

$browser = Start-Process -FilePath $edge -ArgumentList @(
  "--headless=new",
  "--disable-gpu",
  "--remote-debugging-port=9223",
  "--user-data-dir=$profile",
  "http://localhost:3000/login"
) -WindowStyle Hidden -PassThru

try {
  $endpoint = $null
  for ($index = 0; $index -lt 30; $index++) {
    try {
      $endpoint = Invoke-RestMethod "http://127.0.0.1:9223/json/list" -TimeoutSec 1
      if ($endpoint) { break }
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  if (-not $endpoint) { throw "Browser test did not start." }

  $target = $endpoint | Where-Object { $_.type -eq "page" } | Select-Object -First 1
  $socket = [System.Net.WebSockets.ClientWebSocket]::new()
  $socket.ConnectAsync(
    [uri]$target.webSocketDebuggerUrl,
    [Threading.CancellationToken]::None
  ).GetAwaiter().GetResult() | Out-Null

  $script:commandId = 0

  function Invoke-Cdp([string]$method, [hashtable]$params = @{}) {
    $script:commandId++
    $wantedId = $script:commandId
    $json = @{
      id = $wantedId
      method = $method
      params = $params
    } | ConvertTo-Json -Compress -Depth 10
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)

    $socket.SendAsync(
      [ArraySegment[byte]]::new($bytes),
      [Net.WebSockets.WebSocketMessageType]::Text,
      $true,
      [Threading.CancellationToken]::None
    ).GetAwaiter().GetResult()

    while ($true) {
      $message = [Text.StringBuilder]::new()
      do {
        $buffer = New-Object byte[] 65536
        $result = $socket.ReceiveAsync(
          [ArraySegment[byte]]::new($buffer),
          [Threading.CancellationToken]::None
        ).GetAwaiter().GetResult()
        [void]$message.Append([Text.Encoding]::UTF8.GetString($buffer, 0, $result.Count))
      } while (-not $result.EndOfMessage)
      $text = $message.ToString()
      $response = $text | ConvertFrom-Json
      if ($response.id -eq $wantedId) { return $response }
    }
  }

  function Get-PageState {
    $response = Invoke-Cdp "Runtime.evaluate" @{
      expression = 'JSON.stringify({online:navigator.onLine,body:document.body.innerText,status:document.querySelector("button.fixed.bottom-20")?.innerText||null})'
      returnByValue = $true
    }
    return $response.result.result.value | ConvertFrom-Json
  }

  function Invoke-PageExpression([string]$expression, [bool]$awaitPromise = $false) {
    $response = Invoke-Cdp "Runtime.evaluate" @{
      expression = $expression
      awaitPromise = $awaitPromise
      returnByValue = $true
    }
    return $response.result.result.value
  }

  Invoke-Cdp "Network.enable" | Out-Null
  Start-Sleep -Seconds 2
  $online = Get-PageState

  Invoke-Cdp "Network.emulateNetworkConditions" @{
    offline = $true
    latency = 0
    downloadThroughput = 0
    uploadThroughput = 0
  } | Out-Null
  Start-Sleep -Seconds 3
  $offline = Get-PageState

  Invoke-Cdp "Network.emulateNetworkConditions" @{
    offline = $false
    latency = 0
    downloadThroughput = -1
    uploadThroughput = -1
  } | Out-Null
  Start-Sleep -Seconds 1
  $restored = Get-PageState

  Invoke-PageExpression 'location.href="http://localhost:3000/inventory"' | Out-Null
  Start-Sleep -Seconds 3
  $addButtonClicked = Invoke-PageExpression 'window.__offlineTestAlerts=[];window.alert=(message)=>window.__offlineTestAlerts.push(String(message));const button=Array.from(document.querySelectorAll("button")).find((item)=>item.textContent.includes("+"));if(button){button.click();true}else{false}'
  Start-Sleep -Milliseconds 300
  $nameEntered = Invoke-PageExpression '(()=>{const input=document.querySelector(".fixed.inset-0 input[placeholder]");if(!input)return false;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;setter.call(input,"Offline queue test");input.dispatchEvent(new Event("input",{bubbles:true}));return true})()'
  Invoke-Cdp "Network.emulateNetworkConditions" @{
    offline = $true
    latency = 0
    downloadThroughput = 0
    uploadThroughput = 0
  } | Out-Null
  Start-Sleep -Milliseconds 300
  $saveButtonClicked = Invoke-PageExpression '(()=>{const button=Array.from(document.querySelectorAll("button")).find((item)=>item.textContent.includes("\u2705"));if(button){button.click();return true}return false})()'
  Start-Sleep -Seconds 3

  $editButtonClicked = Invoke-PageExpression '(()=>{const button=Array.from(document.querySelectorAll("button")).find((item)=>item.textContent.includes("\u270f"));if(button){button.click();return true}return false})()'
  Start-Sleep -Seconds 7
  $editNameEntered = Invoke-PageExpression '(()=>{const modal=document.querySelector(".fixed.inset-0");const input=modal?.querySelector("input");if(!input)return false;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;setter.call(input,"Offline queue test edited");input.dispatchEvent(new Event("input",{bubbles:true}));return true})()'
  $editSaveClicked = Invoke-PageExpression '(()=>{const button=Array.from(document.querySelectorAll(".fixed.inset-0 button")).find((item)=>item.textContent.includes("\u062d\u0641\u0638 \u0627\u0644\u062a\u0639\u062f\u064a\u0644\u0627\u062a"));if(button){button.click();return true}return false})()'
  Start-Sleep -Seconds 10

  $queueCount = Invoke-PageExpression 'new Promise((resolve,reject)=>{const request=indexedDB.open("sys-offline-sync",1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction("jobs","readonly");const count=tx.objectStore("jobs").count();count.onsuccess=()=>resolve(count.result);count.onerror=()=>reject(count.error)}})' $true
  $queueState = Invoke-PageExpression '({alerts:window.__offlineTestAlerts||[],status:document.querySelector("button.fixed.bottom-20")?.innerText||null})'

  $passed = $online.online -and
    (-not $offline.online) -and
    $offline.status -and
    $restored.online -and
    (-not $restored.status) -and
    ($queueCount -eq 2) -and
    $editButtonClicked -and
    $editNameEntered -and
    $editSaveClicked -and
    $queueState.status

  [pscustomobject]@{
    passed = $passed
    initiallyOnline = $online.online
    offlineDetected = (-not $offline.online)
    offlineMessageVisible = [bool]$offline.status
    offlineStatus = $offline.status
    restoredOnline = $restored.online
    offlineMessageCleared = (-not $restored.status)
    offlineAddQueued = ($queueCount -ge 1)
    offlineEditQueued = ($queueCount -eq 2)
    queuedJobs = $queueCount
    offlineSaveAlerted = ($queueState.alerts.Count -gt 0)
    alerts = $queueState.alerts
    queuedStatus = $queueState.status
    addButtonClicked = $addButtonClicked
    nameEntered = $nameEntered
    saveButtonClicked = $saveButtonClicked
    editButtonClicked = $editButtonClicked
    editNameEntered = $editNameEntered
    editSaveClicked = $editSaveClicked
  } | ConvertTo-Json

  if (-not $passed) { exit 1 }
  $socket.Dispose()
} finally {
  Stop-Process -Id $browser.Id -Force -ErrorAction SilentlyContinue
}
