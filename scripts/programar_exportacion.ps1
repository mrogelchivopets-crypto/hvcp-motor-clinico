# Programa la exportación automática del registro en el Programador de tareas de Windows.
# Corre scripts/exportar_registro.mjs cada 15 minutos mientras la sesión de Windows esté iniciada.
# Uso (PowerShell, en la carpeta del proyecto):   .\scripts\programar_exportacion.ps1
# Para quitarla:                                   Unregister-ScheduledTask -TaskName "HVCP Motor - Exportar registro" -Confirm:$false
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
if (-not (Test-Path (Join-Path $raiz ".env.exportacion"))) { throw "Falta .env.exportacion (copie .env.exportacion.ejemplo y llénelo)." }

$accion = New-ScheduledTaskAction -Execute $node -Argument "`"$raiz\scripts\exportar_registro.mjs`"" -WorkingDirectory $raiz
$disparo = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "HVCP Motor - Exportar registro" -Action $accion -Trigger $disparo -Settings $ajustes `
  -Description "Exporta el registro del Motor Clínico HVCP a Excel en OneDrive cada 15 minutos." -Force | Out-Null
Write-Host "Listo: la exportación corre cada 15 minutos. Revise exportacion.log en la carpeta de destino."
